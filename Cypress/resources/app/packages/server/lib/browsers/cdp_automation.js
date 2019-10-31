"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var lodash_1 = __importDefault(require("lodash"));
var tough_cookie_1 = __importDefault(require("tough-cookie"));
var cors = require('../util/cors');
var cookieMatches = function (cookie, data) {
    if (data.domain && !tough_cookie_1.default.domainMatch(cookie.domain, data.domain)) {
        return false;
    }
    if (data.path && !tough_cookie_1.default.pathMatch(cookie.path, data.path)) {
        return false;
    }
    if (data.name && data.name !== cookie.name) {
        return false;
    }
    return true;
};
exports.CdpAutomation = function (sendDebuggerCommandFn) {
    var normalizeGetCookieProps = function (cookie) {
        if (cookie.expires === -1) {
            delete cookie.expires;
        }
        // @ts-ignore
        cookie.expirationDate = cookie.expires;
        delete cookie.expires;
        // @ts-ignore
        return cookie;
    };
    var normalizeGetCookies = function (cookies) {
        return lodash_1.default.map(cookies, normalizeGetCookieProps);
    };
    var normalizeSetCookieProps = function (cookie) {
        lodash_1.default.defaults(cookie, {
            name: '',
            value: '',
        });
        // this logic forms a SetCookie request that will be received by Chrome
        // see MakeCookieFromProtocolValues for information on how this cookie data will be parsed
        // @see https://cs.chromium.org/chromium/src/content/browser/devtools/protocol/network_handler.cc?l=246&rcl=786a9194459684dc7a6fded9cabfc0c9b9b37174
        // @ts-ignore
        cookie.expires = cookie.expirationDate;
        if (!cookie.hostOnly && cookie.domain[0] !== '.') {
            var parsedDomain = cors.parseDomain(cookie.domain);
            // normally, a non-hostOnly cookie should be prefixed with a .
            // so if it's not a top-level domain (localhost, ...) or IP address
            // prefix it with a . so it becomes a non-hostOnly cookie
            if (parsedDomain && parsedDomain.tld !== cookie.domain) {
                cookie.domain = "." + cookie.domain;
            }
        }
        // not used by Chrome
        delete cookie.hostOnly;
        delete cookie.expirationDate;
        return cookie;
    };
    var getAllCookies = function (data) {
        return sendDebuggerCommandFn('Network.getAllCookies')
            .then(function (result) {
            return normalizeGetCookies(result.cookies)
                .filter(function (cookie) {
                return cookieMatches(cookie, data);
            });
        });
    };
    var getCookiesByUrl = function (url) {
        return sendDebuggerCommandFn('Network.getCookies', {
            urls: [url],
        })
            .then(function (result) {
            return normalizeGetCookies(result.cookies);
        });
    };
    var getCookie = function (data) {
        return getAllCookies(data)
            .then(function (cookies) {
            return lodash_1.default.get(cookies, 0, null);
        });
    };
    var onRequest = function (message, data) {
        var setCookie;
        switch (message) {
            case 'get:cookies':
                if (data.url) {
                    return getCookiesByUrl(data.url);
                }
                return getAllCookies(data);
            case 'get:cookie':
                return getCookie(data);
            case 'set:cookie':
                setCookie = normalizeSetCookieProps(data);
                return sendDebuggerCommandFn('Network.setCookie', setCookie)
                    .then(function (result) {
                    if (!result.success) {
                        // i wish CDP provided some more detail here, but this is really it in v1.3
                        // @see https://chromedevtools.github.io/devtools-protocol/tot/Network/#method-setCookie
                        throw new Error("Network.setCookie failed to set cookie: " + JSON.stringify(setCookie));
                    }
                    return getCookie(data);
                });
            case 'clear:cookie':
                return getCookie(data)
                    // so we can resolve with the value of the removed cookie
                    .tap(function (_cookieToBeCleared) {
                    return sendDebuggerCommandFn('Network.deleteCookies', data);
                });
            case 'is:automation:client:connected':
                return true;
            case 'remote:debugger:protocol':
                return sendDebuggerCommandFn(data.command, data.params);
            case 'take:screenshot':
                return sendDebuggerCommandFn('Page.captureScreenshot')
                    .catch(function (err) {
                    throw new Error("The browser responded with an error when Cypress attempted to take a screenshot.\n\nDetails:\n" + err.message);
                })
                    .then(function (_a) {
                    var data = _a.data;
                    return "data:image/png;base64," + data;
                });
            default:
                throw new Error("No automation handler registered for: '" + message + "'");
        }
    };
    return { onRequest: onRequest };
};
