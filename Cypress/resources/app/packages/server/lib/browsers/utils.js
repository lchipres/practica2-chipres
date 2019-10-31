(function() {
  var PATH_TO_BROWSERS, Promise, appData, copyExtension, ensureCleanCache, fs, getBrowserPath, getExtensionDir, getPartition, getPort, getProfileDir, launcher, path, profileCleaner, removeOldProfiles;

  path = require("path");

  Promise = require("bluebird");

  getPort = require("get-port");

  launcher = require("../../../launcher");

  fs = require("../util/fs");

  appData = require("../util/app_data");

  profileCleaner = require("../util/profile_cleaner");

  PATH_TO_BROWSERS = appData.path("browsers");

  getBrowserPath = function(browser) {
    return path.join(PATH_TO_BROWSERS, "" + browser.name);
  };

  copyExtension = function(src, dest) {
    return fs.copyAsync(src, dest);
  };

  getPartition = function(isTextTerminal) {
    if (isTextTerminal) {
      return "run-" + process.pid;
    }
    return "interactive";
  };

  getProfileDir = function(browser, isTextTerminal) {
    return path.join(getBrowserPath(browser), getPartition(isTextTerminal));
  };

  getExtensionDir = function(browser, isTextTerminal) {
    return path.join(getProfileDir(browser, isTextTerminal), "CypressExtension");
  };

  ensureCleanCache = function(browser, isTextTerminal) {
    var p;
    p = path.join(getProfileDir(browser, isTextTerminal), "CypressCache");
    return fs.removeAsync(p).then(function() {
      return fs.ensureDirAsync(p);
    })["return"](p);
  };

  removeOldProfiles = function() {
    var pathToPartitions, pathToProfiles;
    pathToProfiles = path.join(PATH_TO_BROWSERS, "*");
    pathToPartitions = appData.electronPartitionsPath();
    return Promise.all([profileCleaner.removeRootProfile(pathToProfiles, [path.join(pathToProfiles, "run-*"), path.join(pathToProfiles, "interactive")]), profileCleaner.removeInactiveByPid(pathToProfiles, "run-"), profileCleaner.removeInactiveByPid(pathToPartitions, "run-")]);
  };

  module.exports = {
    getPort: getPort,
    copyExtension: copyExtension,
    getProfileDir: getProfileDir,
    getExtensionDir: getExtensionDir,
    ensureCleanCache: ensureCleanCache,
    removeOldProfiles: removeOldProfiles,
    getBrowserByPath: launcher.detectByPath,
    launch: launcher.launch,
    getBrowsers: function() {
      return launcher.detect().then(function(browsers) {
        var version;
        if (browsers == null) {
          browsers = [];
        }
        version = process.versions.chrome || "";
        return browsers.concat({
          name: "electron",
          family: "electron",
          displayName: "Electron",
          version: version,
          path: "",
          majorVersion: version.split(".")[0],
          info: "Electron is the default browser that comes with Cypress. This is the browser that runs in headless mode. Selecting this browser is useful when debugging. The version number indicates the underlying Chromium version that Electron uses."
        });
      });
    }
  };

}).call(this);
