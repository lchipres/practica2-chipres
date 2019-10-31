(function() {
  var _, allowDestroy, errors, http, networkFailures, onRequest, path, send, url;

  _ = require("lodash");

  url = require("url");

  http = require("http");

  path = require("path");

  send = require("send");

  errors = require("./errors");

  allowDestroy = require("./util/server_destroy");

  networkFailures = require("./util/network_failures");

  onRequest = function(req, res, fileServerFolder) {
    var args, file;
    args = _.compact([fileServerFolder, req.url]);
    file = decodeURI(url.parse(path.join.apply(path, args)).pathname);
    res.setHeader("x-cypress-file-path", file);
    return send(req, url.parse(req.url).pathname, {
      root: path.resolve(fileServerFolder)
    }).on("error", function(err) {
      res.setHeader("x-cypress-file-server-error", true);
      res.setHeader("content-type", "text/html");
      res.statusCode = err.status;
      return res.end(networkFailures.get(file, err.status));
    }).pipe(res);
  };

  module.exports = {
    create: function(fileServerFolder) {
      return new Promise(function(resolve) {
        var srv;
        srv = http.createServer(function(req, res) {
          return onRequest(req, res, fileServerFolder);
        });
        allowDestroy(srv);
        return srv.listen(0, '127.0.0.1', function() {
          return resolve({
            port: function() {
              return srv.address().port;
            },
            address: function() {
              return "http://localhost:" + this.port();
            },
            close: function() {
              return srv.destroyAsync();
            }
          });
        });
      });
    }
  };

}).call(this);
