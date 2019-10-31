"use strict";
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
var log_1 = require("./log");
var cp = __importStar(require("child_process"));
/** list of the browsers we can detect and use by default */
exports.browsers = [
    {
        name: 'chrome',
        family: 'chrome',
        displayName: 'Chrome',
        versionRegex: /Google Chrome (\S+)/,
        profile: true,
        binary: ['google-chrome', 'chrome', 'google-chrome-stable'],
    },
    {
        name: 'chromium',
        family: 'chrome',
        displayName: 'Chromium',
        versionRegex: /Chromium (\S+)/,
        profile: true,
        binary: ['chromium-browser', 'chromium'],
    },
    {
        name: 'canary',
        family: 'chrome',
        displayName: 'Canary',
        versionRegex: /Google Chrome Canary (\S+)/,
        profile: true,
        binary: 'google-chrome-canary',
    },
];
/** starts a found browser and opens URL if given one */
function launch(browser, url, args) {
    if (args === void 0) { args = []; }
    log_1.log('launching browser %o to open %s', browser, url);
    if (!browser.path) {
        throw new Error("Browser " + browser.name + " is missing path");
    }
    if (url) {
        args = [url].concat(args);
    }
    log_1.log('spawning browser %o with args %s', browser, args.join(' '));
    return cp.spawn(browser.path, args, { stdio: 'ignore' });
}
exports.launch = launch;
