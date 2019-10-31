(function() {
  var COOKIE_PROPERTIES, Promise, _, cookies, debug, extension, normalizeCookieProps, normalizeCookies, normalizeGetCookieProps, normalizeGetCookies;

  _ = require("lodash");

  Promise = require("bluebird");

  extension = require("../../../extension");

  debug = require("debug")("cypress:server:cookies");

  COOKIE_PROPERTIES = "name value path domain secure httpOnly expiry hostOnly".split(" ");

  normalizeCookies = function(cookies) {
    return _.map(cookies, normalizeCookieProps);
  };

  normalizeCookieProps = function(props) {
    var cookie;
    if (!props) {
      return props;
    }
    cookie = _.chain(props).pick(COOKIE_PROPERTIES).omitBy(_.isUndefined).omitBy(_.isNull).value();
    switch (false) {
      case props.expiry == null:
        delete cookie.expiry;
        cookie.expirationDate = props.expiry;
        break;
      case props.expirationDate == null:
        delete cookie.expirationDate;
        delete cookie.url;
        cookie.expiry = props.expirationDate;
    }
    return cookie;
  };

  normalizeGetCookies = function(cookies) {
    return _.chain(cookies).map(normalizeGetCookieProps).sortBy(_.partialRight(_.get, 'expiry', Number.MAX_SAFE_INTEGER)).value();
  };

  normalizeGetCookieProps = function(props) {
    var cookie;
    if (!props) {
      return props;
    }
    cookie = normalizeCookieProps(props);
    return _.omit(cookie, 'hostOnly');
  };

  cookies = function(cyNamespace, cookieNamespace) {
    var isNamespaced;
    isNamespaced = function(cookie) {
      var name;
      name = cookie && cookie.name;
      if (!name) {
        return false;
      }
      return name.startsWith(cyNamespace) || name === cookieNamespace;
    };
    return {
      getCookies: function(data, automate) {
        debug("getting:cookies %o", data);
        return automate(data).then(function(cookies) {
          cookies = normalizeGetCookies(cookies);
          cookies = _.reject(cookies, isNamespaced);
          debug("received get:cookies %o", cookies);
          return cookies;
        });
      },
      getCookie: function(data, automate) {
        debug("getting:cookie %o", data);
        return automate(data).then(function(cookie) {
          if (isNamespaced(cookie)) {
            throw new Error("Sorry, you cannot get a Cypress namespaced cookie.");
          } else {
            cookie = normalizeGetCookieProps(cookie);
            debug("received get:cookie %o", cookie);
            return cookie;
          }
        });
      },
      setCookie: function(data, automate) {
        var cookie, ref;
        if (isNamespaced(data)) {
          throw new Error("Sorry, you cannot set a Cypress namespaced cookie.");
        } else {
          cookie = normalizeCookieProps(data);
          cookie.url = (ref = data.url) != null ? ref : extension.getCookieUrl(data);
          debug("set:cookie %o", cookie);
          return automate(cookie).then(function(cookie) {
            cookie = normalizeGetCookieProps(cookie);
            debug("received set:cookie %o", cookie);
            return cookie;
          });
        }
      },
      clearCookie: function(data, automate) {
        if (isNamespaced(data)) {
          throw new Error("Sorry, you cannot clear a Cypress namespaced cookie.");
        } else {
          debug("clear:cookie %o", data);
          return automate(data).then(function(cookie) {
            cookie = normalizeCookieProps(cookie);
            debug("received clear:cookie %o", cookie);
            return cookie;
          });
        }
      },
      clearCookies: function(data, automate) {
        var clear;
        cookies = _.reject(normalizeCookies(data), isNamespaced);
        debug("clear:cookies %o", cookies);
        clear = function(cookie) {
          return automate("clear:cookie", {
            name: cookie.name,
            domain: cookie.domain
          }).then(normalizeCookieProps);
        };
        return Promise.map(cookies, clear);
      },
      changeCookie: function(data) {
        var c, msg;
        c = normalizeCookieProps(data.cookie);
        if (isNamespaced(c)) {
          return;
        }
        msg = data.removed ? "Cookie Removed: '" + c.name + "'" : "Cookie Set: '" + c.name + "'";
        return {
          cookie: c,
          message: msg,
          removed: data.removed
        };
      }
    };
  };

  cookies.normalizeCookies = normalizeCookies;

  cookies.normalizeCookieProps = normalizeCookieProps;

  module.exports = cookies;

}).call(this);
