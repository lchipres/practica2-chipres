"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var log_1 = require("../log");
var ramda_1 = require("ramda");
var errors_1 = require("../errors");
var execa_1 = __importDefault(require("execa"));
function getLinuxBrowser(name, binary, versionRegex) {
    var getVersion = function (stdout) {
        var m = versionRegex.exec(stdout);
        if (m) {
            return m[1];
        }
        log_1.log('Could not extract version from %s using regex %s', stdout, versionRegex);
        throw errors_1.notInstalledErr(binary);
    };
    var logAndThrowError = function (err) {
        log_1.log('Received error detecting browser binary: "%s" with error:', binary, err.message);
        throw errors_1.notInstalledErr(binary);
    };
    return getVersionString(binary)
        .then(getVersion)
        .then(function (version) {
        return {
            name: name,
            version: version,
            path: binary,
        };
    })
        .catch(logAndThrowError);
}
function getVersionString(path) {
    log_1.log('finding version string using command "%s --version"', path);
    return execa_1.default
        .stdout(path, ['--version'])
        .then(ramda_1.trim)
        .then(ramda_1.tap(ramda_1.partial(log_1.log, ['stdout: %s'])));
}
exports.getVersionString = getVersionString;
function detect(browser) {
    return getLinuxBrowser(browser.name, browser.binary, browser.versionRegex);
}
exports.detect = detect;
