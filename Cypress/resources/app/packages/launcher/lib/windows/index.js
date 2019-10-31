"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var execa_1 = __importDefault(require("execa"));
var fs_extra_1 = require("fs-extra");
var os_1 = require("os");
var path_1 = require("path");
var ramda_1 = require("ramda");
var errors_1 = require("../errors");
var log_1 = require("../log");
function formFullAppPath(name) {
    var prefix = 'C:/Program Files (x86)/Google/Chrome/Application';
    return path_1.normalize(path_1.join(prefix, name + ".exe"));
}
function formChromiumAppPath() {
    var exe = 'C:/Program Files (x86)/Google/chrome-win32/chrome.exe';
    return path_1.normalize(exe);
}
function formChromeCanaryAppPath() {
    var home = os_1.homedir();
    var exe = path_1.join(home, 'AppData', 'Local', 'Google', 'Chrome SxS', 'Application', 'chrome.exe');
    return path_1.normalize(exe);
}
var formPaths = {
    chrome: formFullAppPath,
    canary: formChromeCanaryAppPath,
    chromium: formChromiumAppPath,
};
function getWindowsBrowser(name) {
    var getVersion = function (stdout) {
        // result from wmic datafile
        // "Version=61.0.3163.100"
        var wmicVersion = /^Version=(\S+)$/;
        var m = wmicVersion.exec(stdout);
        if (m) {
            return m[1];
        }
        log_1.log('Could not extract version from %s using regex %s', stdout, wmicVersion);
        throw errors_1.notInstalledErr(name);
    };
    var formFullAppPathFn = formPaths[name] || formFullAppPath;
    var exePath = formFullAppPathFn(name);
    log_1.log('exe path %s', exePath);
    return fs_extra_1.pathExists(exePath)
        .then(function (exists) {
        log_1.log('found %s ?', exePath, exists);
        if (!exists) {
            throw errors_1.notInstalledErr("Browser " + name + " file not found at " + exePath);
        }
        return getVersionString(exePath)
            .then(ramda_1.tap(log_1.log))
            .then(getVersion)
            .then(function (version) {
            log_1.log('browser %s at \'%s\' version %s', name, exePath, version);
            return {
                name: name,
                version: version,
                path: exePath,
            };
        });
    })
        .catch(function () {
        throw errors_1.notInstalledErr(name);
    });
}
function getVersionString(path) {
    var doubleEscape = function (s) { return s.replace(/\\/g, '\\\\'); };
    // on Windows using "--version" seems to always start the full
    // browser, no matter what one does.
    var args = [
        'datafile',
        'where',
        "name=\"" + doubleEscape(path) + "\"",
        'get',
        'Version',
        '/value',
    ];
    return execa_1.default('wmic', args)
        .then(function (result) { return result.stdout; })
        .then(ramda_1.trim);
}
exports.getVersionString = getVersionString;
function detect(browser) {
    return getWindowsBrowser(browser.name);
}
exports.detect = detect;
