//  region Introduction
//  sigfox-gcloud is a framework for building a Sigfox server, based
//  on Google Cloud Functions.  This module contains the framework functions
//  used by sigfox-gcloud Cloud Functions.  They should also work with Linux, MacOS
//  and Ubuntu on Windows for unit testing.
/*  eslint-disable camelcase, no-console, no-nested-ternary, global-require, import/no-unresolved, max-len, new-cap, import/newline-after-import */

//  //////////////////////////////////////////////////////////////////////////////////// endregion
//  region Declarations - Helper constants to detect if we are running on Google Cloud or AWS.
const isGoogleCloud = !!process.env.FUNCTION_NAME || !!process.env.GAE_SERVICE;
const isAWS = !!process.env.AWS_LAMBDA_FUNCTION_NAME;
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

const tracing = process.env.DISABLE_TRACE ? null : require('gcloud-trace')();
const tracingtrace = process.env.DISABLE_TRACE ? null : require('gcloud-trace/src/trace');

function createRootTrace(req, rootTraceId) {
  //  Return the root trace for instrumentation.
  //  eslint-disable-next-line new-cap
  if (!tracingtrace) return null;
  return new tracingtrace(tracing, rootTraceId);
}

function startTrace(/* req */) {
  //  Start the trace.
  if (!tracing) return null;
  return tracing.startTrace();
}

//  //////////////////////////////////////////////////////////////////////////////////// endregion
//  region Logging Functions: Log to Google Cloud Logging, Error Reporting and PubSub

let loggingLog = null;
const errorReport = require('@google-cloud/error-reporting')({ reportUnhandledRejections: true });

function getLogger() {
  //  Return the logger object for writing logs.  Create it if necessary.
  if (!loggingLog) { // eslint-disable-next-line global-require
    loggingLog = require('@google-cloud/logging')(credentials)
      .log(logName, { removeCircular: true }); //  Mark circular refs by [Circular]
    // console.log('created_logger');
  }
  return loggingLog;
}

function reportError(req, err /* action, para */) {
  //  Report the error to the Stackdriver Error Reporting API
  errorReport.report(err);
}

function shutdown(req, useCallback, error, result) {
  //  Close all cloud connections.  If useCallback is true, return the error or result
  //  to AWS through the callback.  useCallback is normally true except for sigfoxCallback.
  //  Google Cloud Logger must be disposed or it will throw errors later.
  loggingLog = null;
  // console.log('disposed_logger');
  return Promise.resolve(error || result);
}

//  //////////////////////////////////////////////////////////////////////////////////// endregion
//  region Messaging Functions: Dispatch messages between Cloud Functions via Google Cloud PubSub

const pubsub = require('@google-cloud/pubsub');
const queueCache = {};

function getQueue(req, projectId0, topicName) {
  //  Return the PubSub queue for the topic.
  const key = [projectId0, topicName].join('|');
  if (queueCache[key]) return queueCache[key];

  const pubsubCredentials = Object.assign({}, credentials,
    { projectId: projectId0 || projectId });  // eslint-disable-next-line no-use-before-define
  const topic = pubsub(pubsubCredentials).topic(topicName);
  queueCache[key] = topic;
  return topic;
}

//  //////////////////////////////////////////////////////////////////////////////////// endregion
//  region Device State Functions: Memorise the device state with Google Cloud IoT

//  TODO

//  //////////////////////////////////////////////////////////////////////////////////// endregion
//  region Startup

function init(para1, para2, para3) {
  //  Run the function in the wrapper, passed as "this".
  //  Call the callback upon success or failure.
  //  Returns a promise.  The number of parameters depend on
  //  whether this function is called in HTTP Mode (para=req,res)
  //  or PubSub Queue Mode (para=event).

  //  Check the mode of trigger: HTTP or PubSub.
  if (process.env.FUNCTION_TRIGGER_TYPE === 'HTTP_TRIGGER') {
    //  HTTP Function: (para1,para2) = (req,res)
    const req = Object.assign({}, para1);  //  Shallow clone the request.
    const res = para2;
    const task = para3;
    req.res = res;  //  Save the response object in the request for easy reference.
    const result = { req, res };
    if (task) result.task = task;
    return result;
  }
  //  Else it will be PubSub Queue Mode: para1=event.
  //  Decode the body.
  const event = para1;
  const task = para2;
  const result = { event };
  if (task) result.task = task;
  return result;
}

//  //////////////////////////////////////////////////////////////////////////////////// endregion
//  region Module Exports

let metadataModule = null;

function getMetadataModule() {
  //  Create google-metadata module on demand.  Because google-metadata requires googleapis.
  console.log(metadataModule ? 'reuse metadata module' : 'created metadata module');
  if (!metadataModule) metadataModule = require('./lib/google-metadata');
  return metadataModule;
}

//  Here are the functions specific to Google Cloud.  We will expose the sigfox-iot-cloud interface which is common to Google Cloud and AWS.
const cloud = {
  isGoogleCloud,
  isAWS,
  projectId,
  functionName,
  logName,
  sourceName: process.env.GAE_SERVICE || process.env.FUNCTION_NAME || logName,
  credentials,

  //  Logging
  getLogger,
  reportError,

  //  Instrumentation
  startTrace,
  createRootTrace,

  //  Messaging
  getQueue,

  //  Metadata
  authorizeMetadata: (req, scopes) => getMetadataModule().authorizeMetadata(req, scopes),
  getMetadata: (req, authClient) => getMetadataModule().getMetadata(req, authClient),
  convertMetadata: (req, metadata) => getMetadataModule().convertMetadata(req, metadata),

  //  Device State: Not implemented yet for Google Cloud.  Will probably be based on Google Cloud IoT.
  createDevice: (/* req, device */) => Promise.resolve({}),
  getDeviceState: (/* req, device */) => Promise.resolve({}),
  updateDeviceState: (req, device, state) => Promise.resolve(state),

  //  Startup
  init,
  shutdown,
};

//  Functions common to Google Cloud and AWS are exposed here.  So clients of both clouds will see the same interface.
module.exports = require('sigfox-iot-cloud')(cloud);
