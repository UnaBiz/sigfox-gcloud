//  sigfox-gcloud is a framework for building a Sigfox server, based
//  on Google Cloud Functions.  Here are the common functions used by
//  Google Cloud Functions.  They should also work with Linux, MacOS
//  and Ubuntu on Windows for unit test.

/* eslint-disable camelcase, no-console, no-nested-ternary, global-require, import/no-unresolved */
//  If the file .env exists in the current folder, use it to populate
//  the environment variables e.g. GCLOUD_PROJECT=myproject
require('dotenv').load();

//  Environment variable GCLOUD_PROJECT must be set to your Google Cloud
//  project ID e.g. export GCLOUD_PROJECT=myproject
const projectId = process.env.GCLOUD_PROJECT;    //  Google Cloud project ID.
const functionName = process.env.FUNCTION_NAME || 'unknown_function';
const isCloudFunc = !!functionName;  //  True if running in Google Cloud Function.

//  Assume that the Google Service Account credentials are present in this file.
//  This is needed for calling Google Cloud PubSub, Logging, Trace, Debug APIs
//  on Linux / MacOS / Ubuntu on Windows.  Assume it's in the main folder for the app.
const keyFilename = [process.cwd(), 'google-credentials.json'].join('/');
//  If we are running in the Google Cloud, no credentials necessary.
const googleCredentials = isCloudFunc ? null : { projectId, keyFilename };

const logging = require('@google-cloud/logging')(googleCredentials);
const pubsub = require('@google-cloud/pubsub')(googleCredentials);
const Buffer = require('safe-buffer').Buffer;
const version = require('./package.json').version || 'unknown';

const logName = 'sigfox-gcloud';  //  Name of the log to write to.
const loggingLog = logging.log(logName);
const service = `cloud_function:${functionName}`;
const serviceContext = { service, version };

function log(req, action0, para0) {
  //  Write the action and parameters to Google Cloud Logging for normal log,
  //  or to Google Cloud Error Reporting if para contains error.
  //  Returns a promise for the error, if it exists, or the result promise,
  //  else null promise. req contains the Express or PubSub request info.
  const para = Object.assign({}, para0);  //  Clone the parameters.
  const action = [functionName, action0].join('/');  //  Prefix action by function name.
  const level = (para && para.error) ? 'ERROR' : 'DEBUG';
  //  Compute the duration in seconds with 1 decimal place.
  if (req.starttime) para.duration = parseInt((Date.now() - req.starttime) / 100, 10) / 10.0;
  const metadata = {
    severity: level.toUpperCase(),
    resource: {
      type: 'cloud_function',
      labels: { function_name: functionName },
    } };
  const event = {};
  if (para && para.error) {
    //  Log errors to Google Cloud Error Reporting.
    console.error(para.error, { action, para });
    event.message = para.error.stack;
    event.serviceContext = serviceContext;
  } else { /* eslint-disable no-underscore-dangle */
    //  Else log to Google Cloud Logging. We use _ and __ because
    //  it delimits the action and parameters nicely in the log.
    event.__ = action || '';
    event._ = para || '';
  } /* eslint-enable no-underscore-dangle */
  //  Write the log.
  return loggingLog.write(loggingLog.entry(metadata, event))
    .catch(err => console.error(err))
    //  If error return the error. Else return the result or null.
    .then(() => (para.error || para.result || null));
}

function isProcessedMessage(/* req, message */) {
  //  Return true if this message is being or has been processed recently by this server
  //  or another server.  We check the central queue.  In case of error return false.
  //  Returns a promise.
  return Promise.resolve(false);  //  TODO
}

function publishMessage(req, oldMessage, device, type) {
  //  Publish the message to the device or message type queue in PubSub.
  //  If device is non-null, publish to sigfox.devices.<<device>>
  //  If type is non-null, publish to sigfox.types.<<type>>
  //  Returns a promise for the published message.
  const topicName = device
    ? `sigfox.devices.${device}`
    : type
      ? `sigfox.types.${type}`
      : 'sigfox.devices.missing_device';
  const topic = pubsub.topic(topicName);
  const message = Object.assign({}, oldMessage,
    device ? { device: (device === 'all') ? oldMessage.device : device }
      : type ? { type }
      : { device: 'missing_device' });
  if (device === 'all') message.device = oldMessage.device;
  const destination = topicName;
  return topic.publish(message)
    .then(result => log(req, 'publishMessage',
      { result, destination, topicName, message, device, type }))
    .catch(error => log(req, 'publishMessage',
      { error, destination, topicName, message, device, type }));
}

function updateMessageHistory(req, oldMessage) {
  //  Update the message history in the message. Records the duration that
  //  was spent processing this request, also latency of message delivery.
  //  Message history is an array of records, from earliest to latest:
  //  [ { timestamp, end, duration, latency, source, function }, ... ]
  //  Source is the message queue that supplied the message:
  //  e.g. projects/myproject/topics/sigfox.devices.all
  //  Duration and latency are in seconds.
  //  Returns the updated clone of the message.
  const message = Object.assign({}, oldMessage);  //  Clone the message.
  if (!message.history) message.history = [];
  const timestamp = req.starttime;
  const end = Date.now();
  //  Compute the duration in seconds with 1 decimal place.
  const duration = timestamp ? (parseInt((end - timestamp) / 100, 10) / 10.0) : null;
  //  Compute the latency between queues in second with 1 decimal place.
  const lastSend = (message.history.length > 0)
    ? message.history[message.history.length - 1].end
    : null;  //  Get the last send time.
  const latency = lastSend ? (parseInt((timestamp - lastSend) / 100, 10) / 10.0) : null;
  //  Source looks like projects/myproject/topics/sigfox.devices.all
  const source = (req && req.event) ? req.event.resource : req.path;
  const rec = {
    timestamp,
    end,
    duration,
    latency,
    source,
    function: functionName,
  };
  message.history.push(rec);
  return message;
}

function dispatchMessage(req, oldMessage, device) {
  //  Dispatch the message to the next step in the route of the message.
  //  message contains { device, type, body, query, route }
  //  route looks like [ messagetype1, messagetype2, ... ]
  //  Returns a promise for the updated message.  Caller must have set
  //  const req = { starttime: Date.now(), event };

  //  If already dispatched, return.
  if (oldMessage.isDispatched) return Promise.resolve(oldMessage);
  //  Update the message history.
  const message = updateMessageHistory(req, oldMessage);
  if (!message.route || message.route.length === 0) {
    //  No more steps to dispatch, quit.
    const result = message;
    log(req, 'dispatchMessage', { result, status: 'no_route', message, device });
    return Promise.resolve(result);
  }
  //  Get the next step and publish the message there.
  //  Don't use shift() because it mutates the original object:
  //  const type = msg.route.shift();
  message.type = message.route[0];
  message.route = message.route.slice(1);
  const type = message.type;
  const route = message.route;
  const destination = type;
  const result = message;
  return publishMessage(req, message, null, type)
    .then(res => log(req, 'dispatchMessage',
      { result, destination, res, route, message, device, type }))
    .catch(error => log(req, 'dispatchMessage',
      { error, destination, route, message, device, type }))
    .then(() => result);
}

function runTask(req, event, task, device, body, message) {
  //  The task is the pluggable function, provided by the caller,
  //  that will perform a single step of Sigfox message processing
  //  e.g. decodeStructuredMessage, logToGoogleSheets.
  //  Wait for the task to complete then dispatch to next step.
  //  Returns a promise for the dispatched message.
  let updatedMessage = message;
  return task(req, device, body, message)
    .then(result => log(req, 'result', { result, device, body, event, message }))
    .then((result) => { updatedMessage = result; return result; })
    .catch(error => log(req, 'failed', { error, device, body, event, message }))
    .then(() => dispatchMessage(req, updatedMessage, device));
}

function main(event, task) {
  //  Start point for the Cloud Function, which is triggered by the delivery
  //  of a PubSub message. Decode the Sigfox message and perform the task specified
  //  by the caller to process the Sigfox message.  Then dispatch the next step of
  //  the route in the message, set by routeMessage.
  //  task should have the signature task(req, device, body, message).
  //  event contains
  //  { eventType: "providers/cloud.pubsub/eventTypes/topic.publish"
  //    resource: "projects/myproject/topics/sigfox.devices.all"
  //    timestamp: "2017-05-06T10:19:29.666Z"
  //    data: {…}  //  Base64 encoded Sigfox message
  //    eventId: "120816659675797" }
  const req = { starttime: Date.now(), event };  //  Record start time.
  //  Decode the base64 message.
  const message = JSON.parse(Buffer.from(event.data.data, 'base64').toString());
  const device = message ? message.device : null;
  const body = message ? message.body : null;
  req.uuid = body.uuid;
  if (message.isDispatched) delete message.isDispatched;
  log(req, 'start', { device, body, event, message, env: process.env });

  //  If the message is already processed by another server, skip it.
  return isProcessedMessage(req, message)
    .then(isProcessed => (
      isProcessed
        ? log(req, 'skip', { result: message, isProcessed, device, body, event, message })
        //  Else wait for the task to complete then dispatch the next step.
        : runTask(req, event, task, device, body, message)
    ))
    //  Log the final result i.e. the dispatched message.
    .then(result => log(req, 'end', { result, device, body, event, message }));
}

module.exports = {
  projectId,
  functionName,
  isCloudFunc,
  keyFilename,
  log,
  isProcessedMessage,
  updateMessageHistory,
  publishMessage,
  dispatchMessage,
  main,
};


