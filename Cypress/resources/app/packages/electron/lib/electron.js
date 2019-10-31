(function() {
  var Promise, cp, debug, fs, inspector, install, minimist, os, path, paths;

  fs = require("fs-extra");

  cp = require("child_process");

  os = require("os");

  path = require("path");

  debug = require("debug")("cypress:electron");

  Promise = require("bluebird");

  minimist = require("minimist");

  inspector = require("inspector");

  paths = require("./paths");

  install = require("./install");

  fs = Promise.promisifyAll(fs);

  module.exports = {
    installIfNeeded: function() {
      return install.check();
    },
    install: function() {
      debug("installing %j", arguments);
      return install["package"].apply(install, arguments);
    },
    cli: function(argv) {
      var opts, pathToApp;
      if (argv == null) {
        argv = [];
      }
      opts = minimist(argv);
      debug("cli options %j", opts);
      pathToApp = argv[0];
      switch (false) {
        case !opts.install:
          return this.installIfNeeded();
        case !pathToApp:
          return this.open(pathToApp, argv);
        default:
          throw new Error("No path to your app was provided.");
      }
    },
    open: function(appPath, argv, cb) {
      var dest;
      debug("opening %s", appPath);
      appPath = path.resolve(appPath);
      dest = paths.getPathToResources("app");
      debug("appPath %s", appPath);
      debug("dest path %s", dest);
      return fs.statAsync(appPath).then(function() {
        debug("appPath exists %s", appPath);
        return fs.removeAsync(dest);
      }).then(function() {
        var symlinkType;
        symlinkType = paths.getSymlinkType();
        debug("making symlink from %s to %s of type %s", appPath, dest, symlinkType);
        return fs.ensureSymlinkAsync(appPath, dest, symlinkType);
      }).then(function() {
        var dp, execPath, opts;
        execPath = paths.getPathToExec();
        if (os.platform() === "linux" && process.geteuid() === 0) {
          argv.unshift("--no-sandbox");
        }
        if (inspector.url()) {
          dp = process.debugPort + 1;
          argv.unshift("--inspect-brk=" + dp);
        } else {
          opts = minimist(argv);
          if (opts.inspectBrk) {
            argv.unshift("--inspect-brk=5566");
          }
        }
        argv.unshift("--max-http-header-size=" + (1024 * 1024));
        debug("spawning %s with args", execPath, argv);
        if (debug.enabled) {
          argv.push("--enable-logging");
        }
        return cp.spawn(execPath, argv, {
          stdio: "inherit"
        }).on("close", function(code, errCode) {
          debug("electron closing %o", {
            code: code,
            errCode: errCode
          });
          if (code) {
            debug("original command was");
            debug(execPath, argv.join(" "));
          }
          if (cb) {
            debug("calling callback with code", code);
            return cb(code);
          } else {
            debug("process.exit with code", code);
            return process.exit(code);
          }
        });
      })["catch"](function(err) {
        console.debug(err.stack);
        return process.exit(1);
      });
    }
  };

}).call(this);
