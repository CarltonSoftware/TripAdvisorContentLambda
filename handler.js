var scripts = require('./scripts');

exports.handler = function (event, context, callback) {
  scripts.processMessage(event.Records[0].Sns.Message);
};