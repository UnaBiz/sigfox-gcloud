//  Google Cloud Function decodeStructuredMessage is triggered when a
//  Sigfox message is sent to the PubSub message queue
//  sigfox.types.decodeStructuredMessage.
//  We decode the structured sensor data inside the Sigfox message,
//  sent by unabiz-arduino library, containing field names and values.

//  See this for the definition of structured messages:
//  https://github.com/UnaBiz/unabiz-arduino/wiki/UnaShield

//  //////////////////////////////////////////////////////////////////////////////////////////
//  Begin Common Declarations

/* eslint-disable camelcase, no-console, no-nested-ternary, import/no-dynamic-require,
 import/newline-after-import, import/no-unresolved, global-require, max-len */
if (process.env.FUNCTION_NAME) {
  //  Load the Google Cloud Trace and Debug Agents before any require().
  //  Only works in Cloud Function.
  require('@google-cloud/trace-agent').start();
  require('@google-cloud/debug-agent').start();
}
//  const sgcloud = require('../index');  //  For Unit Test.
const sgcloud = require('sigfox-gcloud');
const structuredMessage = require('./structuredMessage');

//  End Common Declarations
//  //////////////////////////////////////////////////////////////////////////////////////////

//  //////////////////////////////////////////////////////////////////////////////////////////
//  Begin Message Processing Code

function decodeMessage(req, body) {
  //  Decode the packed binary SIGFOX message body data e.g. 920e5a00b051680194597b00
  //  2 bytes name, 2 bytes float * 10, 2 bytes name, 2 bytes float * 10, ...
  //  Returns a promise for the updated body.
  if (!body || !body.data) return Promise.resolve(null);
  try {
    const decodedData = structuredMessage.decodeMessage(body.data);
    const result = Object.assign({}, body, decodedData);
    sgcloud.log(req, 'decodeMessage', { result, body });
    return Promise.resolve(result);
  } catch (error) {
    //  In case of error, return the original message.
    sgcloud.log(req, 'decodeMessage', { error, body });
    return Promise.resolve(body);
  }
}

function task(req, device, body, msg) {
  //  The task for this Google Cloud Function:
  //  Decode the structured body in the Sigfox message.
  //  This adds additional fields to the message body,
  //  e.g. ctr (counter), lig (light level), tmp (temperature).
  return decodeMessage(req, body)
    //  Return the message with the body updated.
    .then(updatedBody => Object.assign({}, msg, { body: updatedBody }))
    .catch((error) => { throw error; });
}

//  End Message Processing Code
//  //////////////////////////////////////////////////////////////////////////////////////////

//  //////////////////////////////////////////////////////////////////////////////////////////
//  Main Function

//  When this Google Cloud Function is triggered, we call main() then task().
exports.main = event => sgcloud.main(event, task);

//  Expose the task function for unit test only.
exports.task = task;
