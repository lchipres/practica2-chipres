(function() {
  var _, debug, os, pkg, runner, send;

  _ = require("lodash");

  send = require("send");

  os = require("os");

  debug = require("debug")("cypress:server:runner");

  pkg = require("../../../root");

  runner = require("../../../runner/lib/resolve-dist");

  module.exports = {
    serve: function(req, res, options) {
      var base64Config, browser, config, getRemoteState, project, ref, spec;
      if (options == null) {
        options = {};
      }
      config = options.config, getRemoteState = options.getRemoteState, project = options.project;
      ref = project.getCurrentSpecAndBrowser(), spec = ref.spec, browser = ref.browser;
      config = _.clone(config);
      config.remote = getRemoteState();
      config.version = pkg.version;
      config.platform = os.platform();
      config.arch = os.arch();
      config.spec = spec;
      config.browser = browser;
      debug("serving runner index.html with config %o", _.pick(config, "version", "platform", "arch", "projectName"));
      base64Config = Buffer.from(JSON.stringify(config)).toString('base64');
      return res.render(runner.getPathToIndex(), {
        base64Config: base64Config,
        projectName: config.projectName
      });
    },
    handle: function(req, res) {
      var pathToFile;
      pathToFile = runner.getPathToDist(req.params[0]);
      return send(req, pathToFile).pipe(res);
    }
  };

}).call(this);
