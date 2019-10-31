(function() {
  var Project, Promise, _, browsers, chokidar, config, create, debug, files, la, path, preprocessor, specsUtil,
    slice = [].slice;

  _ = require("lodash");

  la = require("lazy-ass");

  debug = require("debug")("cypress:server:openproject");

  Promise = require("bluebird");

  path = require("path");

  chokidar = require("chokidar");

  files = require("./controllers/files");

  config = require("./config");

  Project = require("./project");

  browsers = require("./browsers");

  specsUtil = require("./util/specs");

  preprocessor = require("./plugins/preprocessor");

  create = function() {
    var openProject, relaunchBrowser, reset, specsWatcher, tryToCall;
    openProject = null;
    relaunchBrowser = null;
    specsWatcher = null;
    reset = function() {
      openProject = null;
      return relaunchBrowser = null;
    };
    tryToCall = function(method) {
      return function() {
        var args;
        args = 1 <= arguments.length ? slice.call(arguments, 0) : [];
        if (openProject) {
          return openProject[method].apply(openProject, args);
        } else {
          return Promise.resolve(null);
        }
      };
    };
    return {
      reset: tryToCall("reset"),
      getConfig: tryToCall("getConfig"),
      createCiProject: tryToCall("createCiProject"),
      getRecordKeys: tryToCall("getRecordKeys"),
      getRuns: tryToCall("getRuns"),
      requestAccess: tryToCall("requestAccess"),
      emit: tryToCall("emit"),
      getProject: function() {
        return openProject;
      },
      launch: function(browser, spec, options) {
        if (options == null) {
          options = {};
        }
        debug("resetting project state, preparing to launch browser");
        la(_.isPlainObject(browser), "expected browser object:", browser);
        return this.reset().then(function() {
          return openProject.getSpecUrl(spec.absolute);
        }).then(function(url) {
          return openProject.getConfig().then(function(cfg) {
            var am, automation, onBrowserClose;
            options.browsers = cfg.browsers;
            options.proxyUrl = cfg.proxyUrl;
            options.userAgent = cfg.userAgent;
            options.proxyServer = cfg.proxyUrl;
            options.socketIoRoute = cfg.socketIoRoute;
            options.chromeWebSecurity = cfg.chromeWebSecurity;
            options.url = url;
            options.isTextTerminal = cfg.isTextTerminal;
            if (!_.has(browser, "isHeaded")) {
              browser.isHeaded = true;
              browser.isHeadless = false;
            }
            options.browser = browser;
            openProject.setCurrentSpecAndBrowser(spec, browser);
            automation = openProject.getAutomation();
            if (am = options.automationMiddleware) {
              automation.use(am);
            }
            automation.use({
              onBeforeRequest: function(message, data) {
                if (message === "take:screenshot") {
                  data.specName = spec.name;
                  return data;
                }
              }
            });
            onBrowserClose = options.onBrowserClose;
            options.onBrowserClose = function() {
              if (spec && spec.absolute) {
                preprocessor.removeFile(spec.absolute, cfg);
              }
              if (onBrowserClose) {
                return onBrowserClose();
              }
            };
            return (relaunchBrowser = function() {
              debug("launching browser: %o, spec: %s", browser, spec.relative);
              return browsers.open(browser, options, automation);
            })();
          });
        });
      },
      getSpecChanges: function(options) {
        var checkForSpecUpdates, createSpecsWatcher, currentSpecs, get, sendIfChanged;
        if (options == null) {
          options = {};
        }
        currentSpecs = null;
        _.defaults(options, {
          onChange: function() {},
          onError: function() {}
        });
        sendIfChanged = function(specs) {
          if (specs == null) {
            specs = [];
          }
          if (_.isEqual(specs, currentSpecs)) {
            return;
          }
          currentSpecs = specs;
          return options.onChange(specs);
        };
        checkForSpecUpdates = _.debounce((function(_this) {
          return function() {
            if (!openProject) {
              return _this.stopSpecsWatcher();
            }
            debug("check for spec updates");
            return get().then(sendIfChanged)["catch"](options.onError);
          };
        })(this), 250, {
          leading: true
        });
        createSpecsWatcher = function(cfg) {
          if (specsWatcher) {
            return;
          }
          debug("watch test files: %s in %s", cfg.testFiles, cfg.integrationFolder);
          specsWatcher = chokidar.watch(cfg.testFiles, {
            cwd: cfg.integrationFolder,
            ignored: cfg.ignoreTestFiles,
            ignoreInitial: true
          });
          specsWatcher.on("add", checkForSpecUpdates);
          return specsWatcher.on("unlink", checkForSpecUpdates);
        };
        get = function() {
          return openProject.getConfig().then(function(cfg) {
            createSpecsWatcher(cfg);
            return specsUtil.find(cfg);
          }).then(function(specs) {
            if (specs == null) {
              specs = [];
            }
            return {
              integration: specs
            };
          });
        };
        return checkForSpecUpdates();
      },
      stopSpecsWatcher: function() {
        debug("stop spec watcher");
        return Promise["try"](function() {
          return specsWatcher != null ? specsWatcher.close() : void 0;
        });
      },
      closeBrowser: function() {
        return browsers.close();
      },
      closeOpenProjectAndBrowsers: function() {
        return Promise.all([this.closeBrowser(), openProject ? openProject.close() : void 0]).then(function() {
          reset();
          return null;
        });
      },
      close: function() {
        debug("closing opened project");
        this.stopSpecsWatcher();
        return this.closeOpenProjectAndBrowsers();
      },
      create: function(path, args, options) {
        if (args == null) {
          args = {};
        }
        if (options == null) {
          options = {};
        }
        openProject = Project(path);
        _.defaults(options, {
          onReloadBrowser: (function(_this) {
            return function(url, browser) {
              if (relaunchBrowser) {
                return relaunchBrowser();
              }
            };
          })(this)
        });
        if (!_.isUndefined(args.configFile)) {
          options.configFile = args.configFile;
        }
        options = _.extend({}, args.config, options);
        debug("opening project %s", path);
        return openProject.open(options)["return"](this);
      }
    };
  };

  module.exports = create();

  module.exports.Factory = create;

}).call(this);
