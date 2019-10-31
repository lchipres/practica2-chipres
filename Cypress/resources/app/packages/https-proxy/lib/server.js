(function() {
  var Promise, SSL_RECORD_TYPES, Server, _, agent, allowDestroy, connect, debug, fs, getProxyForUrl, https, net, onError, parse, ref, semaphore, sslIpServers, sslSemaphores, sslServers, url,
    bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; },
    indexOf = [].indexOf || function(item) { for (var i = 0, l = this.length; i < l; i++) { if (i in this && this[i] === item) return i; } return -1; };

  _ = require("lodash");

  ref = require("../../network"), agent = ref.agent, allowDestroy = ref.allowDestroy, connect = ref.connect;

  debug = require("debug")("cypress:https-proxy");

  fs = require("fs-extra");

  getProxyForUrl = require("proxy-from-env").getProxyForUrl;

  https = require("https");

  net = require("net");

  parse = require("./util/parse");

  Promise = require("bluebird");

  semaphore = require("semaphore");

  url = require("url");

  fs = Promise.promisifyAll(fs);

  sslServers = {};

  sslIpServers = {};

  sslSemaphores = {};

  SSL_RECORD_TYPES = [22, 128, 0];

  onError = function(err) {
    return debug('server error %o', {
      err: err
    });
  };

  Server = (function() {
    function Server(_ca, _port, _options) {
      this._ca = _ca;
      this._port = _port;
      this._options = _options;
      this._getServerPortForIp = bind(this._getServerPortForIp, this);
      this._onError = null;
      this._ipServers = sslIpServers;
    }

    Server.prototype.connect = function(req, browserSocket, head, options) {
      if (options == null) {
        options = {};
      }
      browserSocket.setNoDelay(true);
      debug("Writing browserSocket connection headers %o", {
        url: req.url,
        headLength: _.get(head, 'length'),
        headers: req.headers
      });
      browserSocket.on("error", (function(_this) {
        return function(err) {
          return debug("received error on client browserSocket %o", {
            err: err,
            url: req.url
          });
        };
      })(this));
      browserSocket.write("HTTP/1.1 200 OK\r\n");
      if (req.headers["proxy-connection"] === "keep-alive") {
        browserSocket.write("Proxy-Connection: keep-alive\r\n");
        browserSocket.write("Connection: keep-alive\r\n");
      }
      browserSocket.write("\r\n");
      if (_.get(head, "length")) {
        return this._onFirstHeadBytes(req, browserSocket, head, options);
      }
      return browserSocket.once("data", (function(_this) {
        return function(data) {
          return _this._onFirstHeadBytes(req, browserSocket, data, options);
        };
      })(this));
    };

    Server.prototype._onFirstHeadBytes = function(req, browserSocket, head, options) {
      var odc;
      debug("Got first head bytes %o", {
        url: req.url,
        head: _.chain(head).invoke('toString').slice(0, 64).join('').value()
      });
      browserSocket.pause();
      if (odc = options.onDirectConnection) {
        if (odc.call(this, req, browserSocket, head) === true) {
          return this._makeDirectConnection(req, browserSocket, head);
        } else {
          debug("Not making direct connection %o", {
            url: req.url
          });
        }
      }
      return this._onServerConnectData(req, browserSocket, head);
    };

    Server.prototype._onUpgrade = function(fn, req, browserSocket, head) {
      if (fn) {
        return fn.call(this, req, browserSocket, head);
      }
    };

    Server.prototype._onRequest = function(fn, req, res) {
      var hostPort;
      hostPort = parse.hostAndPort(req.url, req.headers, 443);
      req.url = url.format({
        protocol: "https:",
        hostname: hostPort.host,
        port: hostPort.port
      }) + req.url;
      if (fn) {
        return fn.call(this, req, res);
      }
      return req.pipe(request(req.url)).on("error", function() {
        res.statusCode = 500;
        return res.end();
      }).pipe(res);
    };

    Server.prototype._getProxyForUrl = function(urlStr) {
      var port;
      port = Number(_.get(url.parse(urlStr), 'port'));
      debug('getting proxy URL %o', {
        port: port,
        serverPort: this._port,
        sniPort: this._sniPort,
        url: urlStr
      });
      if ([this._sniPort, this._port].includes(port)) {
        return void 0;
      }
      return getProxyForUrl(urlStr);
    };

    Server.prototype._makeDirectConnection = function(req, browserSocket, head) {
      var hostname, port, ref1;
      ref1 = url.parse("https://" + req.url), port = ref1.port, hostname = ref1.hostname;
      debug("Making connection to " + hostname + ":" + port);
      return this._makeConnection(browserSocket, head, port, hostname);
    };

    Server.prototype._makeConnection = function(browserSocket, head, port, hostname) {
      var onSocket, upstreamProxy;
      onSocket = (function(_this) {
        return function(err, upstreamSocket) {
          debug('received upstreamSocket callback for request %o', {
            port: port,
            hostname: hostname,
            err: err
          });
          onError = function(err) {
            browserSocket.destroy(err);
            if (_this._onError) {
              return _this._onError(err, browserSocket, head, port);
            }
          };
          if (err) {
            return onError(err);
          }
          upstreamSocket.setNoDelay(true);
          upstreamSocket.on("error", onError);
          browserSocket.pipe(upstreamSocket);
          upstreamSocket.pipe(browserSocket);
          upstreamSocket.write(head);
          return browserSocket.resume();
        };
      })(this);
      port || (port = "443");
      if (upstreamProxy = this._getProxyForUrl("https://" + hostname + ":" + port)) {
        debug("making proxied connection %o", {
          host: hostname + ":" + port,
          proxy: upstreamProxy
        });
        return agent.httpsAgent.createUpstreamProxyConnection({
          proxy: upstreamProxy,
          href: "https://" + hostname + ":" + port,
          uri: {
            port: port,
            hostname: hostname
          },
          shouldRetry: true
        }, onSocket);
      }
      return connect.createRetryingSocket({
        port: port,
        host: hostname
      }, onSocket);
    };

    Server.prototype._onServerConnectData = function(req, browserSocket, head) {
      var firstBytes, hostname, makeConnection, sem, sslServer;
      firstBytes = head[0];
      makeConnection = (function(_this) {
        return function(port) {
          debug("Making intercepted connection to %s", port);
          return _this._makeConnection(browserSocket, head, port, "localhost");
        };
      })(this);
      if (indexOf.call(SSL_RECORD_TYPES, firstBytes) < 0) {
        return makeConnection(this._port);
      }
      hostname = url.parse("https://" + req.url).hostname;
      if (sslServer = sslServers[hostname]) {
        return makeConnection(sslServer.port);
      }
      if (!(sem = sslSemaphores[hostname])) {
        sem = sslSemaphores[hostname] = semaphore(1);
      }
      return sem.take((function(_this) {
        return function() {
          var leave;
          leave = function() {
            return process.nextTick(function() {
              return sem.leave();
            });
          };
          if (sslServer = sslServers[hostname]) {
            leave();
            return makeConnection(sslServer.port);
          }
          return _this._getPortFor(hostname).then(function(port) {
            sslServers[hostname] = {
              port: port
            };
            leave();
            return makeConnection(port);
          });
        };
      })(this));
    };

    Server.prototype._normalizeKeyAndCert = function(certPem, privateKeyPem) {
      return {
        key: privateKeyPem,
        cert: certPem
      };
    };

    Server.prototype._getCertificatePathsFor = function(hostname) {
      return this._ca.getCertificateKeysForHostname(hostname).spread(this._normalizeKeyAndCert);
    };

    Server.prototype._generateMissingCertificates = function(hostname) {
      return this._ca.generateServerCertificateKeys(hostname).spread(this._normalizeKeyAndCert);
    };

    Server.prototype._getPortFor = function(hostname) {
      return this._getCertificatePathsFor(hostname)["catch"]((function(_this) {
        return function(err) {
          return _this._generateMissingCertificates(hostname);
        };
      })(this)).then((function(_this) {
        return function(data) {
          if (data == null) {
            data = {};
          }
          if (net.isIP(hostname)) {
            return _this._getServerPortForIp(hostname, data);
          }
          _this._sniServer.addContext(hostname, data);
          return _this._sniPort;
        };
      })(this));
    };

    Server.prototype._listenHttpsServer = function(data) {
      return new Promise((function(_this) {
        return function(resolve, reject) {
          var server;
          server = https.createServer(data);
          allowDestroy(server);
          server.once("error", reject);
          server.on("upgrade", _this._onUpgrade.bind(_this, _this._options.onUpgrade));
          server.on("request", _this._onRequest.bind(_this, _this._options.onRequest));
          return server.listen(0, '127.0.0.1', function() {
            var port;
            port = server.address().port;
            server.removeListener("error", reject);
            server.on("error", onError);
            return resolve({
              server: server,
              port: port
            });
          });
        };
      })(this));
    };

    Server.prototype._getServerPortForIp = function(ip, data) {
      var server;
      if (server = sslIpServers[ip]) {
        return server.address().port;
      }
      return this._listenHttpsServer(data).then(function(arg) {
        var port, server;
        server = arg.server, port = arg.port;
        sslIpServers[ip] = server;
        debug("Created IP HTTPS Proxy Server", {
          port: port,
          ip: ip
        });
        return port;
      });
    };

    Server.prototype.listen = function() {
      this._onError = this._options.onError;
      return this._listenHttpsServer({}).tap((function(_this) {
        return function(arg) {
          var port, server;
          server = arg.server, port = arg.port;
          _this._sniPort = port;
          _this._sniServer = server;
          return debug("Created SNI HTTPS Proxy Server", {
            port: port
          });
        };
      })(this));
    };

    Server.prototype.close = function() {
      var close;
      close = (function(_this) {
        return function() {
          var servers;
          servers = _.values(sslIpServers).concat(_this._sniServer);
          return Promise.map(servers, function(server) {
            return Promise.fromCallback(server.destroy)["catch"](onError);
          });
        };
      })(this);
      return close()["finally"](module.exports.reset);
    };

    return Server;

  })();

  module.exports = {
    reset: function() {
      sslServers = {};
      return sslIpServers = {};
    },
    create: function(ca, port, options) {
      var srv;
      if (options == null) {
        options = {};
      }
      srv = new Server(ca, port, options);
      return srv.listen()["return"](srv);
    }
  };

}).call(this);
