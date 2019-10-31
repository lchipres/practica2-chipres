"use strict";
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
var util_1 = require("./util");
var linuxHelper = __importStar(require("../linux"));
var log_1 = require("../log");
var ramda_1 = require("ramda");
var detectCanary = ramda_1.partial(util_1.findApp, [
    'Contents/MacOS/Google Chrome Canary',
    'com.google.Chrome.canary',
    'KSVersion',
]);
var detectChrome = ramda_1.partial(util_1.findApp, [
    'Contents/MacOS/Google Chrome',
    'com.google.Chrome',
    'KSVersion',
]);
var detectChromium = ramda_1.partial(util_1.findApp, [
    'Contents/MacOS/Chromium',
    'org.chromium.Chromium',
    'CFBundleShortVersionString',
]);
var browsers = {
    chrome: detectChrome,
    canary: detectCanary,
    chromium: detectChromium,
};
function getVersionString(path) {
    return linuxHelper.getVersionString(path);
}
exports.getVersionString = getVersionString;
function detect(browser) {
    var fn = browsers[browser.name];
    if (!fn) {
        // ok, maybe it is custom alias?
        log_1.log('detecting custom browser %s on darwin', browser.name);
        return linuxHelper.detect(browser);
    }
    return fn()
        .then(ramda_1.merge({ name: browser.name }))
        .catch(function () {
        log_1.log('could not detect %s using traditional Mac methods', browser.name);
        log_1.log('trying linux search');
        return linuxHelper.detect(browser);
    });
}
exports.detect = detect;
