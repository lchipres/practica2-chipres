(function() {
  var Promise, _, check, cleanup, debug, ensureAndGetByNameOrPath, errors, fs, getBrowserLauncherByFamily, instance, isBrowserFamily, isValidPathToBrowser, kill, la, path, throwBrowserNotFound, utils;

  _ = require("lodash");

  path = require("path");

  Promise = require("bluebird");

  debug = require("debug")("cypress:server:browsers");

  utils = require("./utils");

  errors = require("../errors");

  fs = require("../util/fs");

  la = require("lazy-ass");

  check = require("check-more-types");

  isBrowserFamily = check.oneOf(["electron", "chrome"]);

  instance = null;

  kill = function(unbind) {
    if (!instance) {
      return Promise.resolve();
    }
    return new Promise(function(resolve) {
      if (unbind) {
        instance.removeAllListeners();
      }
      instance.once("exit", function(code, sigint) {
        debug("browser process killed");
        return resolve.apply(null, arguments);
      });
      debug("killing browser process");
      instance.kill();
      return cleanup();
    });
  };

  cleanup = function() {
    return instance = null;
  };

  getBrowserLauncherByFamily = function(family) {
    if (!isBrowserFamily(family)) {
      debug("unknown browser family", family);
    }
    switch (family) {
      case "electron":
        return require("./electron");
      case "chrome":
        return require("./chrome");
    }
  };

  isValidPathToBrowser = function(str) {
    return path.basename(str) !== str;
  };

  ensureAndGetByNameOrPath = function(nameOrPath, returnAll) {
    if (returnAll == null) {
      returnAll = false;
    }
    return utils.getBrowsers(nameOrPath).then(function(browsers) {
      var browser, sortedBrowsers;
      if (browsers == null) {
        browsers = [];
      }
      sortedBrowsers = _.sortBy(browsers, ['version']);
      if (browser = _.findLast(sortedBrowsers, {
        name: nameOrPath
      })) {
        if (returnAll) {
          return browsers;
        }
        return browser;
      }
      if (isValidPathToBrowser(nameOrPath)) {
        return utils.getBrowserByPath(nameOrPath).then(function(browser) {
          if (returnAll) {
            return [browser].concat(browsers);
          }
          return browser;
        })["catch"](function(err) {
          return errors["throw"]("BROWSER_NOT_FOUND_BY_PATH", nameOrPath, err.message);
        });
      }
      return throwBrowserNotFound(nameOrPath, browsers);
    });
  };

  throwBrowserNotFound = function(browserName, browsers) {
    var names;
    if (browsers == null) {
      browsers = [];
    }
    names = _.map(browsers, "name").join(", ");
    return errors["throw"]("BROWSER_NOT_FOUND_BY_NAME", browserName, names);
  };

  process.once("exit", kill);

  module.exports = {
    ensureAndGetByNameOrPath: ensureAndGetByNameOrPath,
    isBrowserFamily: isBrowserFamily,
    removeOldProfiles: utils.removeOldProfiles,
    get: utils.getBrowsers,
    launch: utils.launch,
    close: kill,
    getAllBrowsersWith: function(nameOrPath) {
      if (nameOrPath) {
        return ensureAndGetByNameOrPath(nameOrPath, true);
      }
      return utils.getBrowsers();
    },
    open: function(browser, options, automation) {
      if (options == null) {
        options = {};
      }
      return kill(true).then(function() {
        var browserLauncher, url;
        _.defaults(options, {
          onBrowserOpen: function() {},
          onBrowserClose: function() {}
        });
        if (!(browserLauncher = getBrowserLauncherByFamily(browser.family))) {
          return throwBrowserNotFound(browser.name, options.browsers);
        }
        if (!(url = options.url)) {
          throw new Error("options.url must be provided when opening a browser. You passed:", options);
        }
        debug("opening browser %o", browser);
        return browserLauncher.open(browser, url, options, automation).then(function(i) {
          debug("browser opened");
          instance = i;
          instance.once("exit", function() {
            options.onBrowserClose();
            return cleanup();
          });
          return Promise.delay(1000).then(function() {
            options.onBrowserOpen();
            return instance;
          });
        });
      });
    }
  };

}).call(this);
