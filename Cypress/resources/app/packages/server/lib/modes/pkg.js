(function() {
  var Promise, pkg;

  Promise = require("bluebird");

  pkg = require("../../../root");

  module.exports = function() {
    return Promise.resolve(pkg);
  };

}).call(this);
