(function() {
  var NO_BODY_STATUS_CODES, Promise, REDIRECT_STATUS_CODES, _, accept, blacklist, buffers, charset, concat, conditional, cors, cwd, debug, getNodeCharsetFromResponse, iconv, isGzipError, passthruStream, reqNeedsBasicAuthHeaders, responseMustHaveEmptyBody, rewriter, setCookie, zlib, zlibOptions,
    indexOf = [].indexOf || function(item) { for (var i = 0, l = this.length; i < l; i++) { if (i in this && this[i] === item) return i; } return -1; };

  _ = require("lodash");

  zlib = require("zlib");

  charset = require("charset");

  concat = require("concat-stream");

  iconv = require("iconv-lite");

  Promise = require("bluebird");

  accept = require("http-accept");

  debug = require("debug")("cypress:server:proxy");

  cwd = require("../cwd");

  cors = require("../util/cors");

  buffers = require("../util/buffers");

  rewriter = require("../util/rewriter");

  blacklist = require("../util/blacklist");

  conditional = require("../util/conditional_stream");

  passthruStream = require("../util/passthru_stream").passthruStream;

  REDIRECT_STATUS_CODES = [301, 302, 303, 307, 308];

  NO_BODY_STATUS_CODES = [204, 304];

  zlib = Promise.promisifyAll(zlib);

  zlibOptions = {
    flush: zlib.Z_SYNC_FLUSH,
    finishFlush: zlib.Z_SYNC_FLUSH
  };

  getNodeCharsetFromResponse = function(headers, body) {
    var httpCharset;
    httpCharset = (charset(headers, body, 1024) || '').toLowerCase();
    debug("inferred charset from response %o", {
      httpCharset: httpCharset
    });
    if (iconv.encodingExists(httpCharset)) {
      return httpCharset;
    }
    return "latin1";
  };

  isGzipError = function(err) {
    return Object.prototype.hasOwnProperty.call(zlib.constants, err.code);
  };

  responseMustHaveEmptyBody = function(method, statusCode) {
    return _.some([_.includes(NO_BODY_STATUS_CODES, statusCode), _.invoke(method, 'toLowerCase') === 'head']);
  };

  setCookie = function(res, key, val, domainName) {
    var options;
    options = {
      domain: domainName
    };
    if (!val) {
      val = "";
      options.expires = new Date(0);
    }
    return res.cookie(key, val, options);
  };

  reqNeedsBasicAuthHeaders = function(req, remoteState) {
    var auth, origin;
    auth = remoteState.auth, origin = remoteState.origin;
    return auth && !req.headers["authorization"] && cors.urlMatchesOriginProtectionSpace(req.proxiedUrl, origin);
  };

  module.exports = {
    handle: function(req, res, config, getRemoteState, request, nodeProxy) {
      var blh, matched, remoteState, thr;
      remoteState = getRemoteState();
      debug("handling proxied request %o", {
        url: req.url,
        proxiedUrl: req.proxiedUrl,
        headers: req.headers,
        remoteState: remoteState
      });
      if (req.cookies["__cypress.unload"]) {
        return res.redirect(config.clientRoute);
      }
      if (req.url === req.proxiedUrl && !remoteState.visiting) {
        return res.redirect(config.clientRoute);
      }
      if (blh = config.blacklistHosts) {
        if (matched = blacklist.matches(req.proxiedUrl, blh)) {
          res.set("x-cypress-matched-blacklisted-host", matched);
          debug("blacklisting request %o", {
            url: req.proxiedUrl,
            matched: matched
          });
          return res.status(503).end();
        }
      }
      thr = passthruStream();
      return this.getHttpContent(thr, req, res, remoteState, config, request).pipe(res);
    },
    getHttpContent: function(thr, req, res, remoteState, config, request) {
      var auth, base64, encodings, endWithNetworkErr, isInitial, obj, onResponse, opts, ref, reqAcceptsHtml, resContentTypeIs, resContentTypeIsJavaScript, resMatchesOriginPolicy, rq, setBody, setCookies, wantsInjection, wantsSecurityRemoved;
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
      isInitial = req.cookies["__cypress.initial"] === "true";
      wantsInjection = null;
      wantsSecurityRemoved = null;
      resContentTypeIs = function(respHeaders, str) {
        var contentType;
        contentType = respHeaders["content-type"];
        return contentType && contentType.includes(str);
      };
      resContentTypeIsJavaScript = function(respHeaders) {
        return _.some(['application/javascript', 'application/x-javascript', 'text/javascript'].map(_.partial(resContentTypeIs, respHeaders)));
      };
      reqAcceptsHtml = function() {
        var find, ref, types;
        if (req.headers["x-requested-with"]) {
          return;
        }
        types = (ref = accept.parser(req.headers.accept)) != null ? ref : [];
        find = function(type) {
          return indexOf.call(types, type) >= 0;
        };
        return find("text/html") && find("application/xhtml+xml");
      };
      resMatchesOriginPolicy = function(respHeaders) {
        switch (remoteState.strategy) {
          case "http":
            return cors.urlMatchesOriginPolicyProps(req.proxiedUrl, remoteState.props);
          case "file":
            return req.proxiedUrl.startsWith(remoteState.origin);
        }
      };
      setCookies = function(value) {
        if ((!value) && (!wantsInjection)) {
          return;
        }
        if (!isInitial) {
          return;
        }
        return setCookie(res, "__cypress.initial", value, remoteState.domainName);
      };
      setBody = function(str, statusCode, headers) {
        var encoding, gunzip, injection, isGzipped, onError, rewrite;
        res.status(statusCode);
        setCookies(false, wantsInjection);
        encoding = headers["content-encoding"];
        isGzipped = encoding && encoding.includes("gzip");
        debug("received response for %o", {
          url: req.proxiedUrl,
          headers: headers,
          statusCode: statusCode,
          isGzipped: isGzipped,
          wantsInjection: wantsInjection,
          wantsSecurityRemoved: wantsSecurityRemoved
        });
        if (responseMustHaveEmptyBody(req.method, statusCode)) {
          return res.end();
        }
        if (wantsInjection) {
          rewrite = function(body) {
            var decodedBody, nodeCharset, rewrittenBody;
            nodeCharset = getNodeCharsetFromResponse(headers, body);
            decodedBody = iconv.decode(body, nodeCharset);
            rewrittenBody = rewriter.html(decodedBody, remoteState.domainName, wantsInjection, wantsSecurityRemoved);
            return iconv.encode(rewrittenBody, nodeCharset);
          };
          injection = concat(function(body) {
            if (_.isEqual(body, [])) {
              body = Buffer.from('');
            }
            if (isGzipped) {
              return zlib.gunzipAsync(body, zlibOptions).then(rewrite).then(zlib.gzipAsync).then(thr.end)["catch"](endWithNetworkErr);
            } else {
              return thr.end(rewrite(body));
            }
          });
          return str.pipe(injection);
        } else {
          if (wantsSecurityRemoved) {
            gunzip = zlib.createGunzip(zlibOptions);
            gunzip.setEncoding("utf8");
            onError = function(err) {
              var gzipError;
              gzipError = isGzipError(err);
              debug("failed to proxy response %o", {
                url: req.proxiedUrl,
                headers: headers,
                statusCode: statusCode,
                isGzipped: isGzipped,
                gzipError: gzipError,
                wantsInjection: wantsInjection,
                wantsSecurityRemoved: wantsSecurityRemoved,
                err: err
              });
              return endWithNetworkErr(err);
            };
            return str.pipe(conditional(isGzipped, gunzip)).on("error", onError).pipe(rewriter.security()).on("error", onError).pipe(conditional(isGzipped, zlib.createGzip())).on("error", onError).pipe(thr).on("error", onError);
          }
          return str.pipe(thr);
        }
      };
      endWithNetworkErr = function(err) {
        debug('request failed in proxy layer %o', {
          res: _.pick(res, 'headersSent', 'statusCode', 'headers'),
          req: _.pick(req, 'url', 'proxiedUrl', 'headers', 'method'),
          err: err
        });
        return req.socket.destroy();
      };
      onResponse = (function(_this) {
        return function(str, incomingRes) {
          var c, cookies, err, headers, i, len, newUrl, originalSetHeader, ref, statusCode;
          headers = incomingRes.headers, statusCode = incomingRes.statusCode;
          originalSetHeader = res.setHeader;
          res.setHeader = function(k, v) {
            if (k === 'content-type') {
              v = incomingRes.headers['content-type'];
            }
            return originalSetHeader.call(res, k, v);
          };
          if (wantsInjection == null) {
            wantsInjection = (function() {
              if (!resContentTypeIs(headers, "text/html")) {
                return false;
              }
              if (!resMatchesOriginPolicy(headers)) {
                return false;
              }
              if (isInitial) {
                return "full";
              }
              if (!reqAcceptsHtml()) {
                return false;
              }
              return "partial";
            })();
          }
          wantsSecurityRemoved = (function() {
            return config.modifyObstructiveCode && ((wantsInjection === "full") || resContentTypeIsJavaScript(headers));
          })();
          _this.setResHeaders(req, res, incomingRes, wantsInjection);
          if (cookies = headers["set-cookie"]) {
            ref = [].concat(cookies);
            for (i = 0, len = ref.length; i < len; i++) {
              c = ref[i];
              try {
                res.append("Set-Cookie", c);
              } catch (error) {
                err = error;
              }
            }
          }
          if (REDIRECT_STATUS_CODES.includes(statusCode)) {
            newUrl = headers.location;
            setCookies(true);
            debug("redirecting to new url %o", {
              status: statusCode,
              url: newUrl
            });
            return res.redirect(statusCode, newUrl);
          }
          if (headers["x-cypress-file-server-error"]) {
            wantsInjection || (wantsInjection = "partial");
          }
          return setBody(str, statusCode, headers);
        };
      })(this);
      if (obj = buffers.take(req.proxiedUrl)) {
        wantsInjection = "full";
        onResponse(obj.stream, obj.response);
      } else {
        opts = {
          timeout: null,
          strictSSL: false,
          followRedirect: false,
          retryIntervals: [0, 100, 200, 200]
        };
        encodings = (ref = accept.parser(req.headers["accept-encoding"])) != null ? ref : [];
        if (indexOf.call(encodings, "gzip") >= 0) {
          req.headers["accept-encoding"] = "gzip";
        } else {
          delete req.headers["accept-encoding"];
        }
        if (remoteState.strategy === "file" && req.proxiedUrl.startsWith(remoteState.origin)) {
          opts.url = req.proxiedUrl.replace(remoteState.origin, remoteState.fileServer);
        } else {
          opts.url = req.proxiedUrl;
        }
        if (reqNeedsBasicAuthHeaders(req, remoteState)) {
          auth = remoteState.auth;
          base64 = Buffer.from(auth.username + ":" + auth.password).toString("base64");
          req.headers["authorization"] = "Basic " + base64;
        }
        rq = request.create(opts);
        rq.on("error", endWithNetworkErr);
        rq.on("response", function(incomingRes) {
          return onResponse(rq, incomingRes);
        });
        req.on("aborted", function() {
          return rq.abort();
        });
        req.pipe(rq);
      }
      return thr;
    },
    setResHeaders: function(req, res, incomingRes, wantsInjection) {
      var headers;
      if (res.headersSent) {
        return;
      }
      headers = _.omit(incomingRes.headers, "set-cookie", "x-frame-options", "content-length", "content-security-policy", "connection");
      if (wantsInjection) {
        headers["cache-control"] = "no-cache, no-store, must-revalidate";
      }
      return res.set(headers);
    }
  };

}).call(this);
