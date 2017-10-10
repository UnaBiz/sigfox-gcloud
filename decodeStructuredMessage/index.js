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
//  Enable DNS cache in case we hit the DNS quota for Google Cloud Functions.
require('dnscache')({ enable: true });
process.on('uncaughtException', err => console.error(err.message, err.stack));  //  Display uncaught exceptions.
if (process.env.FUNCTION_NAME) {
  //  Load the Google Cloud Trace and Debug Agents before any require().
  //  Only works in Cloud Function.
  require('@google-cloud/trace-agent').start();
  require('@google-cloud/debug-agent').start();
}

//  End Common Declarations
//  //////////////////////////////////////////////////////////////////////////////////////////

//  //////////////////////////////////////////////////////////////////////////////////////////
//  Begin Message Processing Code

function wrap() {
  //  Wrap the module into a function so that all Google Cloud resources are properly disposed.
  const sgcloud = require('sigfox-gcloud');
  const structuredMessage = require('./structuredMessage');

  function decodeMessage(req, body) {
    //  Decode the packed binary SIGFOX message body data e.g. 920e5a00b051680194597b00
    //  2 bytes name, 2 bytes float * 10, 2 bytes name, 2 bytes float * 10, ...
    //  Returns a promise for the updated body.  If no body available, return {}.
    if (!body || !body.data) return Promise.resolve(Object.assign({}, body));
    try {
      const decodedData = structuredMessage.decodeMessage(body.data);
      const result = Object.assign({}, body, decodedData);
      sgcloud.log(req, 'decodeMessage', { result, body, device: req.device });
      return Promise.resolve(result);
    } catch (error) {
      //  In case of error, return the original message.
      sgcloud.log(req, 'decodeMessage', { error, body, device: req.device });
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
      .then(updatedBody => Object.assign({}, msg, { body: updatedBody, device: req.device }))
      .catch((error) => { throw error; });
  }

  return {
    //  Expose these functions outside of the wrapper.
    //  When this Google Cloud Function is triggered, we call main() which calls task().
    serveQueue: event => sgcloud.main(event, task),

    //  For unit test only.
    task,
  };
}

//  End Message Processing Code
//  //////////////////////////////////////////////////////////////////////////////////////////

//  //////////////////////////////////////////////////////////////////////////////////////////
//  Main Function

module.exports = {
  //  Expose these functions to be called by Google Cloud Function.

  main: (event) => {
    //  Create a wrapper and serve the PubSub event.
    let wrapper = wrap();
    return wrapper.serveQueue(event)
      //  Dispose the wrapper and all resources inside.
      .then((result) => { wrapper = null; return result; })
      //  Suppress the error or Google Cloud will call the function again.
      .catch((error) => { console.error(error.message, error.stack); wrapper = null; return error; });
  },

  //  For unit test only.
  task: wrap().task,
};
