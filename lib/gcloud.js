//  Google Cloud-specific definitions for sigfox-gcloud
/* eslint-disable max-len */

const isProduction = (process.env.NODE_ENV === 'production');  //  True on production server.
const functionName = process.env.FUNCTION_NAME || 'unknown_function';
const logName = process.env.LOGNAME || 'sigfox-gcloud';
const projectId = process.env.GCLOUD_PROJECT;    //  Google Cloud project ID.

//  This is needed because Node.js doesn't cache DNS lookups and will cause DNS quota to be exceeded in Google Cloud.
require('dnscache')({ enable: true });
//  If the file .env exists in the current folder, use it to populate
//  the environment variables e.g. GCLOUD_PROJECT=myproject
require('dotenv').load();
const path = require('path');

//  Assume that the Google Service Account credentials are present in this file.
//  This is needed for calling Google Cloud PubSub, Logging, Trace, Debug APIs
//  on Linux / MacOS / Ubuntu on Windows.  Assume it's in the main folder for the app.
const keyFilename = path.join(process.cwd(), 'google-credentials.json');
const credentials = isProduction ? null : { projectId, keyFilename };

//  //////////////////////////////////////////////////////////////////////////////////// endregion
//  region Utility Functions

//  //////////////////////////////////////////////////////////////////////////////////// endregion
//  region Instrumentation Functions: Trace the execution of this Sigfox Callback across multiple Cloud Functions via Google Cloud Tracing

const tracing = require('gcloud-trace')();
const tracingtrace = require('gcloud-trace/src/trace');

function createRootTrace(req, rootTraceId) {
  //  Return the root trace for instrumentation.
  //  eslint-disable-next-line new-cap
  return new tracingtrace(tracing, rootTraceId);
}

function startTrace(/* req */) {
  //  Start the trace.
  return tracing.startTrace();
}

//  //////////////////////////////////////////////////////////////////////////////////// endregion
//  region Logging Functions: Log to Google Cloud Logging, Error Reporting and PubSub

const loggingLog = require('@google-cloud/logging')(credentials)
  .log(logName, { removeCircular: true }); //  Mark circular refs by [Circular]
const errorReport = require('@google-cloud/error-reporting')({ reportUnhandledRejections: true });

function reportError(req, err /* action, para */) {
  //  Report the error to the Stackdriver Error Reporting API
  errorReport.report(err);
}

//  //////////////////////////////////////////////////////////////////////////////////// endregion
//  region Messaging Functions: Dispatch messages between Cloud Functions via Google Cloud PubSub

const pubsub = require('@google-cloud/pubsub');

function getQueue(req, projectId0, topicName) {
  //  Return the PubSub queue for the topic.
  const pubsubCredentials = Object.assign({}, credentials,
    { projectId: projectId0 || projectId });  // eslint-disable-next-line no-use-before-define
  const topic = pubsub(pubsubCredentials).topic(topicName);
  return topic;
}

//  //////////////////////////////////////////////////////////////////////////////////// endregion
//  region Device State Functions: Memorise the device state with Google Cloud IoT

//  TODO

//  //////////////////////////////////////////////////////////////////////////////////// endregion
//  region Module Exports

module.exports = {
  projectId,
  functionName,
  logName,
  sourceName: process.env.GAE_SERVICE || process.env.FUNCTION_NAME || logName,
  credentials,

  //  Logging
  loggingLog,
  reportError,

  //  Instrumentation
  startTrace,
  createRootTrace,

  //  Messaging
  getQueue,

  //  Device State: Not implemented yet for Google Cloud.  Will probably be based on Google Cloud IoT.
  createDevice: (/* req, device */) => Promise.resolve({}),
  getDeviceState: (/* req, device */) => Promise.resolve({}),
  updateDeviceState: (req, device, state) => Promise.resolve(state),
};
