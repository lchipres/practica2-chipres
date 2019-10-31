(function() {
  var BlackHoleStream, Promise, _, debug, debugFrames, ffmpeg, ffmpegPath, fs, la, os, path, stream, utils;

  _ = require("lodash");

  la = require("lazy-ass");

  os = require("os");

  path = require("path");

  utils = require("fluent-ffmpeg/lib/utils");

  debug = require("debug")("cypress:server:video");

  ffmpeg = require("fluent-ffmpeg");

  stream = require("stream");

  Promise = require("bluebird");

  ffmpegPath = require("@ffmpeg-installer/ffmpeg").path;

  BlackHoleStream = require("black-hole-stream");

  fs = require("./util/fs");

  debugFrames = require("debug")("cypress:server:video:frames");

  debug("using ffmpeg from %s", ffmpegPath);

  ffmpeg.setFfmpegPath(ffmpegPath);

  module.exports = {
    getMsFromDuration: function(duration) {
      return utils.timemarkToSeconds(duration) * 1000;
    },
    getCodecData: function(src) {
      return new Promise(function(resolve, reject) {
        return ffmpeg().on("stderr", function(stderr) {
          return debug("get codecData stderr log %o", {
            message: stderr
          });
        }).on("codecData", resolve).input(src).format("null").output(new BlackHoleStream()).run();
      }).tap(function(data) {
        return debug('codecData %o', {
          src: src,
          data: data
        });
      }).tapCatch(function(err) {
        return debug("getting codecData failed", {
          err: err
        });
      });
    },
    copy: function(src, dest) {
      debug("copying from %s to %s", src, dest);
      return fs.copyAsync(src, dest, {
        overwrite: true
      })["catch"]({
        code: "ENOENT"
      }, function() {});
    },
    start: function(name, options) {
      var done, endVideoCapture, ended, errored, logErrors, pt, skipped, startCapturing, wantsWrite, writeVideoFrame, written;
      if (options == null) {
        options = {};
      }
      pt = stream.PassThrough();
      ended = Promise.pending();
      done = false;
      errored = false;
      written = false;
      logErrors = true;
      wantsWrite = true;
      skipped = 0;
      _.defaults(options, {
        onError: function() {}
      });
      endVideoCapture = function() {
        done = true;
        if (!written) {
          logErrors = false;
        }
        pt.end();
        return ended.promise;
      };
      writeVideoFrame = function(data) {
        if (done) {
          return;
        }
        written = true;
        debugFrames("writing video frame");
        if (wantsWrite) {
          if (!(wantsWrite = pt.write(data))) {
            return pt.once("drain", function() {
              debugFrames("video stream drained");
              return wantsWrite = true;
            });
          }
        } else {
          skipped += 1;
          return debugFrames("skipping video frame %o", {
            skipped: skipped
          });
        }
      };
      startCapturing = function() {
        return new Promise(function(resolve) {
          var cmd;
          return cmd = ffmpeg({
            source: pt,
            priority: 20
          }).inputFormat("image2pipe").inputOptions("-use_wallclock_as_timestamps 1").videoCodec("libx264").outputOptions("-preset ultrafast").on("start", function(command) {
            debug("capture started %o", {
              command: command
            });
            return resolve({
              cmd: cmd,
              startedVideoCapture: new Date
            });
          }).on("codecData", function(data) {
            return debug("capture codec data: %o", data);
          }).on("stderr", function(stderr) {
            return debug("capture stderr log %o", {
              message: stderr
            });
          }).on("error", function(err, stdout, stderr) {
            debug("capture errored: %o", {
              error: err.message,
              stdout: stdout,
              stderr: stderr
            });
            if (logErrors) {
              options.onError(err, stdout, stderr);
            }
            return ended.reject(err);
          }).on("end", function() {
            debug("capture ended");
            return ended.resolve();
          }).save(name);
        });
      };
      return startCapturing().then(function(arg) {
        var cmd, startedVideoCapture;
        cmd = arg.cmd, startedVideoCapture = arg.startedVideoCapture;
        return {
          cmd: cmd,
          endVideoCapture: endVideoCapture,
          writeVideoFrame: writeVideoFrame,
          startedVideoCapture: startedVideoCapture
        };
      });
    },
    process: function(name, cname, videoCompression, onProgress) {
      var total;
      if (onProgress == null) {
        onProgress = function() {};
      }
      total = null;
      return new Promise(function(resolve, reject) {
        var cmd;
        debug("processing video from %s to %s video compression %o", name, cname, videoCompression);
        return cmd = ffmpeg().input(name).videoCodec("libx264").outputOptions(["-preset fast", "-crf " + videoCompression]).on("start", function(command) {
          return debug("compression started %o", {
            command: command
          });
        }).on("codecData", function(data) {
          debug("compression codec data: %o", data);
          return total = utils.timemarkToSeconds(data.duration);
        }).on("stderr", function(stderr) {
          return debug("compression stderr log %o", {
            message: stderr
          });
        }).on("progress", function(progress) {
          var progressed;
          if (!total) {
            return;
          }
          debug("compression progress: %o", progress);
          progressed = utils.timemarkToSeconds(progress.timemark);
          return onProgress(progressed / total);
        }).on("error", function(err, stdout, stderr) {
          debug("compression errored: %o", {
            error: err.message,
            stdout: stdout,
            stderr: stderr
          });
          return reject(err);
        }).on("end", function() {
          debug("compression ended");
          onProgress(1);
          return fs.moveAsync(cname, name, {
            overwrite: true
          }).then(function() {
            return resolve();
          });
        }).save(cname);
      });
    }
  };

}).call(this);
