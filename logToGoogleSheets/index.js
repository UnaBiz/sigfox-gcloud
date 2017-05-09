//  Google Cloud Function logToGoogleSheets is triggered when a
//  Sigfox message is sent to the PubSub message queue
//  sigfox.types.logToGoogleSheets.
//  We log the received Sigfox message into an existing Google Sheets
//  whose filename is the device ID (in uppercase).  Assumes the Google
//  Service Account has the permission scopes for accessing Google Sheets
//  i.e. Google Drive, Google Sheets scopes.

/* eslint-disable camelcase, no-console, no-nested-ternary, import/no-dynamic-require,
 import/newline-after-import, import/no-unresolved, global-require, max-len */
if (process.env.FUNCTION_NAME) {
  //  Load the Google Cloud Trace and Debug Agents before any require().
  //  Only works in Cloud Function.
  require('@google-cloud/trace-agent').start();
  require('@google-cloud/debug-agent').start();
}
const sigfoxgcloud = require('../index');
const googlesheets = require('../lib/googlesheets');
// const sigfoxgcloud = require('sigfoxgcloud');  //  Eventually
// const googlesheets = require('sigfoxgcloud/lib/googlesheets');  //  Eventually

//  Upon startup, get a Google API token for Google Drive and Sheets access.
googlesheets.getGoogleAuth({});

function task(req, device, body, msg) {
  //  The task for this Google Cloud Function:
  //  Add the values in the Sigfox message to the Google Sheet
  //  whose filename is the device ID.  Flush the cache and save the updates.
  //  TODO: Eventually we should cache the row centrally
  //  and post itself a message to flush the cache (event.resource)
  return googlesheets.addRow(req, device, body)
    .then(() => googlesheets.flush(req, device))
    .then(() => msg);  //  Return the original message.
}

//  When this Google Cloud Function is triggered, we call main() then task().
exports.main = event => sigfoxgcloud.main(event, task);
