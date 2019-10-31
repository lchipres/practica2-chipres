(function() {
  var CHROME_VERSIONS_WITH_BUGGY_ROOT_LAYER_SCROLLING, CHROME_VERSION_INTRODUCING_PROXY_BYPASS_ON_LOOPBACK, CdpAutomation, CriClient, LOAD_EXTENSION, Promise, _, _connectToChromeRemoteInterface, _disableRestorePagesPrompt, _maybeRecordVideo, _navigateUsingCRI, _normalizeArgExtensions, _removeRootExtension, _setAutomation, appData, check, debug, defaultArgs, extension, fs, getRemoteDebuggingPort, la, os, path, pathToExtension, pathToTheme, plugins, pluginsBeforeBrowserLaunch, protocol, utils,
    indexOf = [].indexOf || function(item) { for (var i = 0, l = this.length; i < l; i++) { if (i in this && this[i] === item) return i; } return -1; },
    slice = [].slice;

  _ = require("lodash");

  os = require("os");

  path = require("path");

  Promise = require("bluebird");

  la = require('lazy-ass');

  check = require('check-more-types');

  extension = require("../../../extension");

  debug = require("debug")("cypress:server:browsers:chrome");

  plugins = require("../plugins");

  fs = require("../util/fs");

  appData = require("../util/app_data");

  utils = require("./utils");

  protocol = require("./protocol");

  CdpAutomation = require("./cdp_automation").CdpAutomation;

  CriClient = require("./cri-client");

  LOAD_EXTENSION = "--load-extension=";

  CHROME_VERSIONS_WITH_BUGGY_ROOT_LAYER_SCROLLING = "66 67".split(" ");

  CHROME_VERSION_INTRODUCING_PROXY_BYPASS_ON_LOOPBACK = 72;

  pathToExtension = extension.getPathToExtension();

  pathToTheme = extension.getPathToTheme();

  defaultArgs = ["--test-type", "--ignore-certificate-errors", "--start-maximized", "--silent-debugger-extension-api", "--no-default-browser-check", "--no-first-run", "--noerrdialogs", "--enable-fixed-layout", "--disable-popup-blocking", "--disable-password-generation", "--disable-save-password-bubble", "--disable-single-click-autofill", "--disable-prompt-on-repos", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-renderer-throttling", "--disable-restore-session-state", "--disable-translate", "--disable-new-profile-management", "--disable-new-avatar-menu", "--allow-insecure-localhost", "--reduce-security-for-testing", "--enable-automation", "--disable-device-discovery-notifications", "--disable-infobars", "--autoplay-policy=no-user-gesture-required", "--disable-site-isolation-trials", "--metrics-recording-only", "--disable-prompt-on-repost", "--disable-hang-monitor", "--disable-sync", "--disable-web-resources", "--safebrowsing-disable-auto-update", "--safebrowsing-disable-download-protection", "--disable-client-side-phishing-detection", "--disable-component-update", "--disable-default-apps", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--disable-ipc-flooding-protection", "--disable-backgrounding-occluded-window", "--disable-breakpad", "--password-store=basic", "--use-mock-keychain"];

  getRemoteDebuggingPort = Promise.method(function() {
    var port;
    if (port = Number(process.env.CYPRESS_REMOTE_DEBUGGING_PORT)) {
      return port;
    }
    return utils.getPort();
  });

  pluginsBeforeBrowserLaunch = function(browser, args) {
    if (!plugins.has("before:browser:launch")) {
      return args;
    }
    return plugins.execute("before:browser:launch", browser, args).then(function(newArgs) {
      debug("got user args for 'before:browser:launch'", newArgs);
      return newArgs != null ? newArgs : args;
    });
  };

  _normalizeArgExtensions = function(dest, args) {
    var extensions, loadExtension, userExtensions;
    loadExtension = _.find(args, function(arg) {
      return arg.includes(LOAD_EXTENSION);
    });
    if (loadExtension) {
      args = _.without(args, loadExtension);
      userExtensions = loadExtension.replace(LOAD_EXTENSION, "").split(",");
    }
    extensions = [].concat(userExtensions, dest, pathToTheme);
    args.push(LOAD_EXTENSION + _.compact(extensions).join(","));
    return args;
  };

  _removeRootExtension = function() {
    return fs.removeAsync(appData.path("extensions")).catchReturn(null);
  };

  _disableRestorePagesPrompt = function(userDir) {
    var prefsPath;
    prefsPath = path.join(userDir, "Default", "Preferences");
    return fs.readJson(prefsPath).then(function(preferences) {
      var profile;
      if (profile = preferences.profile) {
        if (profile["exit_type"] !== "Normal" || profile["exited_cleanly"] !== true) {
          debug("cleaning up unclean exit status");
          profile["exit_type"] = "Normal";
          profile["exited_cleanly"] = true;
          return fs.writeJson(prefsPath, preferences);
        }
      }
    })["catch"](function() {});
  };

  _connectToChromeRemoteInterface = function(port) {
    la(check.userPort(port), "expected port number to connect CRI to", port);
    debug("connecting to Chrome remote interface at random port %d", port);
    return protocol.getWsTargetFor(port).then(function(wsUrl) {
      debug("received wsUrl %s for port %d", wsUrl, port);
      return CriClient.create(wsUrl);
    });
  };

  _maybeRecordVideo = function(options) {
    return function(client) {
      if (!options.screencastFrame) {
        debug("screencastFrame is false");
        return client;
      }
      debug('starting screencast');
      client.on('Page.screencastFrame', options.screencastFrame);
      return client.send('Page.startScreencast', {
        format: 'jpeg'
      }).then(function() {
        return client;
      });
    };
  };

  _navigateUsingCRI = function(url) {
    la(check.url(url), "missing url to navigate to", url);
    return function(client) {
      la(client, "could not get CRI client");
      debug("received CRI client");
      debug('navigating to page %s', url);
      return client.send("Page.bringToFront").then(function() {
        return client.send("Page.navigate", {
          url: url
        });
      });
    };
  };

  _setAutomation = function(client, automation) {
    return automation.use(CdpAutomation(client.send));
  };

  module.exports = {
    _normalizeArgExtensions: _normalizeArgExtensions,
    _removeRootExtension: _removeRootExtension,
    _connectToChromeRemoteInterface: _connectToChromeRemoteInterface,
    _maybeRecordVideo: _maybeRecordVideo,
    _navigateUsingCRI: _navigateUsingCRI,
    _setAutomation: _setAutomation,
    _writeExtension: function(browser, isTextTerminal, proxyUrl, socketIoRoute) {
      return extension.setHostAndPath(proxyUrl, socketIoRoute).then(function(str) {
        var extensionBg, extensionDest;
        extensionDest = utils.getExtensionDir(browser, isTextTerminal);
        extensionBg = path.join(extensionDest, "background.js");
        return utils.copyExtension(pathToExtension, extensionDest).then(function() {
          return fs.writeFileAsync(extensionBg, str);
        })["return"](extensionDest);
      });
    },
    _getArgs: function(options) {
      var args, majorVersion, ps, ua;
      if (options == null) {
        options = {};
      }
      _.defaults(options, {
        browser: {}
      });
      args = [].concat(defaultArgs);
      if (os.platform() === "linux") {
        args.push("--disable-gpu");
        args.push("--no-sandbox");
      }
      if (ua = options.userAgent) {
        args.push("--user-agent=" + ua);
      }
      if (ps = options.proxyServer) {
        args.push("--proxy-server=" + ps);
      }
      if (options.chromeWebSecurity === false) {
        args.push("--disable-web-security");
        args.push("--allow-running-insecure-content");
      }
      majorVersion = options.browser.majorVersion;
      if (indexOf.call(CHROME_VERSIONS_WITH_BUGGY_ROOT_LAYER_SCROLLING, majorVersion) >= 0) {
        args.push("--disable-blink-features=RootLayerScrolling");
      }
      if (majorVersion >= CHROME_VERSION_INTRODUCING_PROXY_BYPASS_ON_LOOPBACK) {
        args.push("--proxy-bypass-list=<-loopback>");
      }
      return args;
    },
    open: function(browser, url, options, automation) {
      var isTextTerminal, userDir;
      if (options == null) {
        options = {};
      }
      isTextTerminal = options.isTextTerminal;
      userDir = utils.getProfileDir(browser, isTextTerminal);
      return Promise["try"]((function(_this) {
        return function() {
          var args;
          args = _this._getArgs(options);
          return getRemoteDebuggingPort().then(function(port) {
            args.push("--remote-debugging-port=" + port);
            return Promise.all([utils.ensureCleanCache(browser, isTextTerminal), pluginsBeforeBrowserLaunch(options.browser, args), port]);
          });
        };
      })(this)).spread((function(_this) {
        return function(cacheDir, args, port) {
          return Promise.all([_this._writeExtension(browser, isTextTerminal, options.proxyUrl, options.socketIoRoute), _removeRootExtension(), _disableRestorePagesPrompt(userDir)]).spread(function(extDest) {
            args = _normalizeArgExtensions(extDest, args);
            args.push("--user-data-dir=" + userDir);
            args.push("--disk-cache-dir=" + cacheDir);
            debug("launching in chrome with debugging port", {
              url: url,
              args: args,
              port: port
            });
            return utils.launch(browser, "about:blank", args);
          }).then(function(launchedBrowser) {
            la(launchedBrowser, "did not get launched browser instance");
            return _this._connectToChromeRemoteInterface(port).then(function(criClient) {
              la(criClient, "expected Chrome remote interface reference", criClient);
              return criClient.ensureMinimumProtocolVersion('1.3')["catch"](function(err) {
                throw new Error("Cypress requires at least Chrome 64.\n\nDetails:\n" + err.message);
              }).then(function() {
                var originalBrowserKill;
                _this._setAutomation(criClient, automation);
                originalBrowserKill = launchedBrowser.kill;
                launchedBrowser.kill = function() {
                  var args;
                  args = 1 <= arguments.length ? slice.call(arguments, 0) : [];
                  debug("closing remote interface client");
                  return criClient.close().then(function() {
                    debug("closing chrome");
                    return originalBrowserKill.apply(launchedBrowser, args);
                  });
                };
                return criClient;
              });
            }).then(_this._maybeRecordVideo(options)).then(_this._navigateUsingCRI(url))["return"](launchedBrowser);
          });
        };
      })(this));
    }
  };

}).call(this);
