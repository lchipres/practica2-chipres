"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
var log_1 = require("../log");
var errors_1 = require("../errors");
var ramda_1 = require("ramda");
var execa_1 = __importDefault(require("execa"));
var fs = __importStar(require("fs-extra"));
var path = __importStar(require("path"));
var plist = __importStar(require("plist"));
/** parses Info.plist file from given application and returns a property */
function parse(p, property) {
    var pl = path.join(p, 'Contents', 'Info.plist');
    log_1.log('reading property file "%s"', pl);
    var failed = function (e) {
        var msg = "Info.plist not found: " + pl + "\n    " + e.message;
        log_1.log('could not read Info.plist for %s', pl);
        throw errors_1.notInstalledErr('', msg);
    };
    return fs
        .readFile(pl, 'utf8')
        .then(plist.parse)
        .then(ramda_1.prop(property))
        .then(String) // explicitly convert value to String type
        .catch(failed); // to make TS compiler happy
}
exports.parse = parse;
/** uses mdfind to find app using Ma app id like 'com.google.Chrome.canary' */
function mdfind(id) {
    var cmd = "mdfind 'kMDItemCFBundleIdentifier==\"" + id + "\"' | head -1";
    log_1.log('looking for bundle id %s using command: %s', id, cmd);
    var logFound = function (str) {
        log_1.log('found %s at %s', id, str);
        return str;
    };
    var failedToFind = function () {
        log_1.log('could not find %s', id);
        throw errors_1.notInstalledErr(id);
    };
    return execa_1.default
        .shell(cmd)
        .then(function (result) { return result.stdout; })
        .then(ramda_1.tap(logFound))
        .catch(failedToFind);
}
exports.mdfind = mdfind;
function formApplicationPath(executable) {
    var parts = executable.split('/');
    var name = parts[parts.length - 1];
    var appName = name + ".app";
    return path.join('/Applications', appName);
}
/** finds an application and its version */
function findApp(executable, appId, versionProperty) {
    log_1.log('looking for app %s id %s', executable, appId);
    var findVersion = function (foundPath) {
        return parse(foundPath, versionProperty).then(function (version) {
            return {
                path: path.join(foundPath, executable),
                version: version,
            };
        });
    };
    var tryMdFind = function () {
        return mdfind(appId).then(findVersion);
    };
    var tryFullApplicationFind = function () {
        var applicationPath = formApplicationPath(executable);
        log_1.log('looking for application %s', applicationPath);
        return findVersion(applicationPath);
    };
    return tryMdFind().catch(tryFullApplicationFind);
}
exports.findApp = findApp;
