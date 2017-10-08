//  Google Cloud Function logToGoogleSheets is triggered when a
//  Sigfox message is sent to the PubSub message queue
//  sigfox.types.logToGoogleSheets.
//  We log the received Sigfox message into an existing Google Sheets
//  whose filename is the device ID (in uppercase).  Assumes the Google
//  Service Account has the permission scopes for accessing Google Sheets
//  i.e. Google Drive, Google Sheets scopes.

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
  const googlesheets = require('sigfox-gcloud/lib/googlesheets');

  //  TODO: Upon startup, get a Google API token for Google Drive and Sheets access.
  //  googlesheets.getGoogleAuth({}).catch(() => 'OK');  //  Ignore errors.

  function task(req, device, body, msg) {
    //  The task for this Google Cloud Function:
    //  Add the values in the Sigfox message to the Google Sheet
    //  whose filename is the device ID.  Flush the cache and save the updates.
    //  TODO: Eventually we should cache the row centrally
    //  and post itself a message to flush the cache (event.resource)
    return googlesheets.addRow(req, device, body)
      .then(() => googlesheets.flush(req, device))
      .then(() => msg)  //  Return the original message.
      .catch((error) => {
        sgcloud.log(req, 'task', { error, device, body, msg });
        throw error;
      });
  }

  return {
    //  Expose these functions outside of the wrapper.
    //  When this Google Cloud Function is triggered, we call main() which calls task().
    serveQueue: event => sgcloud.main(event, task),
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
      .then((result) => {
        wrapper = null;  //  Dispose the wrapper and all resources inside.
        return result;
      })
      .catch((error) => {
        wrapper = null;  //  Dispose the wrapper and all resources inside.
        return error;  //  Suppress the error or Google Cloud will call the function again.
      });
  },
};
