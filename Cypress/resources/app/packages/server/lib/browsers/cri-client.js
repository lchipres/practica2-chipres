"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var bluebird_1 = __importDefault(require("bluebird"));
var debug_1 = __importDefault(require("debug"));
var lodash_1 = __importDefault(require("lodash"));
var chromeRemoteInterface = require('chrome-remote-interface');
exports.chromeRemoteInterface = chromeRemoteInterface;
var errors = require('../errors');
var debugVerbose = debug_1.default('cypress-verbose:server:browsers:cri-client');
// debug using cypress-verbose:server:browsers:cri-client:send:*
var debugVerboseSend = debug_1.default('cypress-verbose:server:browsers:cri-client:send:[-->]');
// debug using cypress-verbose:server:browsers:cri-client:recv:*
var debugVerboseReceive = debug_1.default('cypress-verbose:server:browsers:cri-client:recv:[<--]');
/**
 * Enumerations to make programming CDP slightly simpler - provides
 * IntelliSense whenever you use named types.
 */
var CRI;
(function (CRI) {
    var EventNames;
    (function (EventNames) {
        EventNames[EventNames["Page.screencastFrame"] = 0] = "Page.screencastFrame";
    })(EventNames = CRI.EventNames || (CRI.EventNames = {}));
})(CRI || (CRI = {}));
var isVersionGte = function (a, b) {
    return a.major > b.major || (a.major === b.major && a.minor >= b.minor);
};
var getMajorMinorVersion = function (version) {
    var _a = version.split('.', 2).map(Number), major = _a[0], minor = _a[1];
    return { major: major, minor: minor };
};
var maybeDebugCdpMessages = function (cri) {
    if (debugVerboseReceive.enabled) {
        cri._ws.on('message', function (data) {
            data = lodash_1.default
                .chain(JSON.parse(data))
                .tap(function (data) {
                var str = lodash_1.default.get(data, 'params.data');
                if (!lodash_1.default.isString(str)) {
                    return;
                }
                data.params.data = lodash_1.default.truncate(str, {
                    length: 100,
                    omission: "... [truncated string of total bytes: " + str.length + "]",
                });
                return data;
            })
                .value();
            debugVerboseReceive('received CDP message %o', data);
        });
    }
    if (debugVerboseSend.enabled) {
        var send_1 = cri._ws.send;
        cri._ws.send = function (data, callback) {
            debugVerboseSend('sending CDP command %o', JSON.parse(data));
            return send_1.call(cri._ws, data, callback);
        };
    }
};
exports.create = bluebird_1.default.method(function (debuggerUrl) {
    return chromeRemoteInterface({
        target: debuggerUrl,
        local: true,
    })
        .then(function (cri) {
        maybeDebugCdpMessages(cri);
        cri.send = bluebird_1.default.promisify(cri.send, { context: cri });
        cri.close = bluebird_1.default.promisify(cri.close, { context: cri });
        var ensureMinimumProtocolVersion = function (protocolVersion) {
            return getProtocolVersion()
                .then(function (actual) {
                var minimum = getMajorMinorVersion(protocolVersion);
                if (!isVersionGte(actual, minimum)) {
                    errors.throw('CDP_VERSION_TOO_OLD', protocolVersion, actual);
                }
            });
        };
        var getProtocolVersion = lodash_1.default.memoize(function () {
            return cri.send('Browser.getVersion')
                // could be any version <= 1.2
                .catchReturn({ protocolVersion: '0.0' })
                .then(function (_a) {
                var protocolVersion = _a.protocolVersion;
                return getMajorMinorVersion(protocolVersion);
            });
        });
        /**
       * Wrapper around Chrome remote interface client
       * that logs every command sent.
       */
        var client = {
            ensureMinimumProtocolVersion: ensureMinimumProtocolVersion,
            getProtocolVersion: getProtocolVersion,
            send: bluebird_1.default.method(function (command, params) {
                return cri.send(command, params);
            }),
            on: function (eventName, cb) {
                debugVerbose('registering CDP on event %o', { eventName: eventName });
                return cri.on(eventName, cb);
            },
            close: function () {
                return cri.close();
            },
        };
        return client;
    });
});
