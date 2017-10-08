//  sigfox-gcloud is a framework for building a Sigfox server, based
//  on Google Cloud Functions.  Here are the common functions used by
//  Google Cloud Functions.  They should also work with Linux, MacOS
//  and Ubuntu on Windows for unit test.

/* eslint-disable camelcase, no-console, no-nested-ternary, global-require, import/no-unresolved, max-len */
//  This is needed because Node.js doesn't cache DNS lookups and will cause DNS quota to be exceeded
//  in Google Cloud.
require('dnscache')({ enable: true });

//  If the file .env exists in the current folder, use it to populate
//  the environment variables e.g. GCLOUD_PROJECT=myproject
require('dotenv').load();

//  Don't require any other Google Cloud modules in global scope
//  because the connections may expire when running for a long time
//  in Google Cloud Functions.

//  Environment variable GCLOUD_PROJECT must be set to your Google Cloud
//  project ID e.g. export GCLOUD_PROJECT=myproject
const projectId = process.env.GCLOUD_PROJECT;    //  Google Cloud project ID.
const functionName = process.env.FUNCTION_NAME || 'unknown_function';
const isCloudFunc = !!process.env.FUNCTION_NAME || !!process.env.GAE_SERVICE;  //  True if running in Google Cloud.
const isProduction = (process.env.NODE_ENV === 'production');  //  True on production server.
const util = require('util');
const path = require('path');
const uuidv4 = require('uuid/v4');
const isCircular = require('is-circular');
const stringify = require('json-stringify-safe');

//  Assume that the Google Service Account credentials are present in this file.
//  This is needed for calling Google Cloud PubSub, Logging, Trace, Debug APIs
//  on Linux / MacOS / Ubuntu on Windows.  Assume it's in the main folder for the app.
const keyFilename = path.join(process.cwd(), 'google-credentials.json');
//  If we are running in the Google Cloud, no credentials necessary.
const googleCredentials = isCloudFunc ? null : { projectId, keyFilename };
const logName = 'sigfox-gcloud';  //  Name of the log to write to.

function sleep(req, res, millisec) {
  //  Returns a promise that waits for the number of milliseconds.
  return new Promise((accept) => {
    setTimeout(() => {
      accept(res);
    }, millisec);
  });
}

function removeNulls(obj0, level) {
  //  Remove null values recursively.  Skip circular references.
  if (level > 3) return '(truncated)';
  const obj = Object.assign({}, obj0);
  for (const key of Object.keys(obj)) {
    //  console.log({ key });
    const val = obj[key];
    if (val === null || val === undefined) {
      delete obj[key];
    } else if (typeof val === 'object' && !Array.isArray(val)) {
      //  Val is a non-array object.
      let circular = true;
      try {
        circular = isCircular(val);
        // eslint-disable-next-line no-empty
      } catch (err) {}
      if (circular) {
        //  Remove circular references.
        delete obj[key];
        console.error(`Dropped circular reference ${key}`);
        continue;
      }
      obj[key] = removeNulls(val, (level || 0) + 1);
    }
  }
  return obj;
}

function createTraceID(now0) {
  //  Return a trace ID array with local time MMSS-uuid to sort in Firebase.
  const now = now0 || Date.now();
  const s = new Date(now + (8 * 60 * 60 * 1000 * 100)).toISOString();
  return [`${s.substr(14, 2)}${s.substr(17, 2)}-${uuidv4()}`];
}

function publishJSON(req, topic, obj) {
  //  Publish the object as a JSON message to the PubSub topic.
  //  Returns a promise.
  if (!topic) return Promise.resolve(null);
  return topic.publisher().publish(new Buffer(JSON.stringify(obj)))
    .catch(error => { // eslint-disable-next-line no-use-before-define
      log(req, 'publishJSON', { error, topic, obj });
      throw error;
    });
}

function logQueue(req, action, para0) { /* eslint-disable global-require, no-param-reassign */
  //  Write log to a PubSub queue for easier analysis.
  try {
    if (module.exports.logQueueConfig.length === 0) return Promise.resolve(null);
    const now = Date.now();
    if (!req) req = {};
    if (!para0) para0 = {};
    if (!req.traceid) req.traceid = createTraceID(now);
    //  Compute the duration in seconds with 1 decimal place.
    if (req.starttime) para0.duration = parseInt((now - req.starttime) / 100, 10) / 10.0;
    else req.starttime = now;
    const starttime = req.starttime;
    const traceid = req.traceid;

    //  Extract the log fields.
    let userid = null;
    let companyid = null;
    let token = null;
    if (req.userid) userid = req.userid;
    if (req.companyid) companyid = req.companyid;
    if (req && req.get) token = req.get('Authorization') || req.get('token');
    if (token && token.length >= 20) token = `${token.substr(0, 20)}...`;
    const para = removeNulls(para0);

    //  Write the log to pubsub queues.  Each config contains { projectId, topicName }
    const msg = { timestamp: now, starttime, traceid, userid, companyid, token, action, para };
    let promises = Promise.resolve('start');
    const result = [];
    module.exports.logQueueConfig.forEach((config) => {
      //  Create pubsub client upon use to prevent expired connection.
      const credentials = Object.assign({}, googleCredentials,
        { projectId: config.projectId });
      const topic = require('@google-cloud/pubsub')(credentials)
        .topic(config.topicName);
      promises = promises
        .then(() => publishJSON(req, topic, msg))
        //  Suppress any errors so logging can continue.
        .catch((err) => { console.error(config, err.message, err.stack); return err; })
        .then((res) => { result.push(res); });
    });
    return promises //  Suppress any errors.
      .catch((err) => { console.error(err.message, err.stack); return err; })
      .then(() => result);
  } catch (err) {
    console.error(err.message, err.stack);
    return Promise.resolve(err);
  }
} /* eslint-enable global-require, no-param-reassign */

//  List of logging tasks to be completed.
const logTasks = [];
let taskCount = 0;

function writeLog(req, loggingLog0, flush) {
  //  Execute each log task one tick at a time, so it doesn't take too much resources.
  //  If flush is true, flush all logs without waiting for the tick, i.e. when quitting.
  if (logTasks.length === 0) return Promise.resolve('OK');
  const task = logTasks.shift();
  if (!task) return Promise.resolve('OK');
  console.log(`***** ${taskCount++} / ${logTasks.length}`);

  //  Create logging client here to prevent expired connection.
  const loggingLog = loggingLog0 ||
    require('@google-cloud/logging')(googleCredentials).log(logName);

  //  Wait for the task to finish, then schedule the next task.
  return task(loggingLog)
    .catch((err) => { console.error(err.message, err.stack); return err; })
    .then(() => {  //  If flushing, don't wait for the tick.
      if (flush) {
        return writeLog(req, loggingLog, flush)
          .catch((err) => { console.error(err.message, err.stack); return err; });
      }
      // eslint-disable-next-line no-use-before-define
      scheduleLog(req);
      return null;
    })
    .catch((err) => { console.error(err.message, err.stack); return err; });
}

function scheduleLog(req) {
  //  Schedule for the log to be written at every tick, if there are tasks.
  if (logTasks.length === 0) return;
  process.nextTick(() => {
    try {
      writeLog(req);
    } catch (err2) {
      console.error(err2.message, err2.stack);
    } });
}

function flushLog(req) {
  //  Flush all log items when we are quitting.
  return writeLog(req, null, true)
    .catch((err) => { console.error(err.message, err.stack); return err; });
}

function deferLog(req, action, para0, record, now, loggingLog) { /* eslint-disable no-param-reassign */
  //  Write the action and parameters to Google Cloud Logging for normal log,
  //  or to Google Cloud Error Reporting if para contains error.
  //  loggingLog contains the Google Cloud logger.  Returns a promise.
  try {
    //  Don't log any null values, causes Google Log errors.
    const para = removeNulls(para0 || {});
    //  Log to PubSub for easier analysis.
    return logQueue(req, action, para)
      .catch((err) => { console.error(err.message, err.stack); return err; })  //  Suppress error.
      .then(() => {
        //  Log the parameters.
        //  noinspection Eslint
        for (const key of Object.keys(para)) {  //  noinspection JSUnfilteredForInLoop
          let json = null;
          try {
            //   Strip off any special symbols.
            const val = para[key];
            if (key === '_req') continue;
            if (key === 'error' && (val === null || val === {})) continue;
            if (val === undefined) continue;
            json = stringify(val);
            record[key] = JSON.parse(json);
          } catch (err) {  /* eslint-disable no-console */
            console.error({ deferLog: err.message, json });
          } /* eslint-enable no-console */
        }
        if (req) {
          //  Log the user properties.
          if (req.user) {
            record.user = { email: req.user.email || req.user.emails || req.user };
          }
        }
        record.source = process.env.GAE_SERVICE || process.env.FUNCTION_NAME || logName;
        if (!isProduction || process.env.CIRCLECI) {
          //  Log to console in dev.
          const out = [action, util.inspect(record, { colors: true })].join(' | ');
          if (para.err) console.error(out);
          else console.log(out);
        }
        const level = para.err ? 'ERROR' : 'DEBUG';
        const metadata = {
          severity: level.toUpperCase(),
          resource: {
            type: 'cloud_function',
            labels: { function_name: functionName },
          } };
        const event = {};
        //  Else log to Google Cloud Logging. We use _ and __ because
        //  it delimits the action and parameters nicely in the log.
        //  eslint-disable-next-line no-underscore-dangle
        event.__ = action || '';
        event._ = para || '';
        if (!isCloudFunc) {
          const out = [action, require('util').inspect(para, { colors: true })].join(' | ');
          console.log(out);
        }
        return loggingLog.write(loggingLog.entry(metadata, event))  //  Suppress error.
          .catch((err2) => { console.error(err2.message, err2.stack); return err2; });
      })
      .catch((err) => { console.error(err.message, err.stack); return err; });  //  Suppress error.
  } catch (err) {
    console.error(err.message, err.stack);
    return Promise.resolve(err);  //  Suppress error.
  }
} /* eslint-enable no-param-reassign */

/* eslint-disable no-underscore-dangle, import/newline-after-import, no-param-reassign */
function log(req0, action, para0) {
  //  Write the action and parameters to Google Cloud Logging for normal log,
  //  or to Google Cloud Error Reporting if para contains error.
  //  Returns a promise for the error, if it exists, or the result promise,
  //  else null promise. req contains the Express or PubSub request info.
  //  Don't log any null values, causes Google Log errors.
  try {
    const now = Date.now();
    const req = req0 || {};
    const para = Object.assign({}, para0);
    const err = para0.err || para0.error || null;

    if (!req.traceid) req.traceid = createTraceID(now);
    //  Compute the duration in seconds with 1 decimal place.
    if (req.starttime) para0.duration = parseInt((now - req.starttime) / 100, 10) / 10.0;
    else req.starttime = now;
    if (err) console.error(err.message, err.stack);
    if (err && isProduction) {
      try {
        //  Report the error to the Stackdriver Error Reporting API
        const errorReport = require('@google-cloud/error-reporting')({ reportUnhandledRejections: true });

        errorReport.report(err)
          .catch((err2) => { console.error(err2.message, err2.stack); });
      } catch (err2) { console.error(err2.message, err2.stack); }
    }
    const record = { timestamp: `${now}`, action };
    if (err) {
      //  If error appears in "error" field, move to "err" field.
      para.err = err;
      if (para.error) delete para.error;
      record.status = 'error';
    } else if (para.status) record.status = para.status;
    if (req) {
      //  Copy common request properties.
      if (req.userid) para.userid = req.userid;
      if (req.deviceid) para.deviceid = req.deviceid;
    }
    //  Write the log in the next tick, so we don't block.
    logTasks.push((loggingLog) => (
      deferLog(req, action, para, record, now, loggingLog)
        .catch((err2) => {
          console.error(err2.message, err2.stack);
          return err2;
        })
    ));
    if (logTasks.length === 1) scheduleLog({});  //  Means nobody else has started schedule.
    return err || para.result || null;
  } catch (err) {
    console.error(err.message, err.stack);
    return para0 ? (para0.err || para0.error || para0.result || null) : null;
  }
} /* eslint-enable no-param-reassign, global-require */

//  TODO
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
  //  If message contains options.unpackBody=true, then send message.body as the root of the
  //  message.  This is used for sending log messages to BigQuery via Google Cloud DataFlow.
  //  The caller must have called server/bigquery/validateLogSchema.
  //  Returns a promise for the PubSub topic.publish result.
  const topicName0 = device
    ? `sigfox.devices.${device}`
    : type
      ? `sigfox.types.${type}`
      : 'sigfox.devices.missing_device';
  const res = module.exports.transformRoute(req, type, device, googleCredentials, topicName0);
  const credentials = res.credentials;
  const topicName = res.topicName;
  //  Create pubsub client here to prevent expired connection.
  //  eslint-disable-next-line global-require
  const topic = require('@google-cloud/pubsub')(credentials).topic(topicName);

  let message = Object.assign({}, oldMessage,
    device ? { device: (device === 'all') ? oldMessage.device : device }
      : type ? { type }
      : { device: 'missing_device' });
  if (device === 'all') message.device = oldMessage.device;

  //  If message contains options.unpackBody=true, then send message.body as the root of the
  //  message.  This is used for sending log messages to BigQuery via Google Cloud DataFlow.
  //  The caller must have called server/bigquery/validateLogSchema.
  if (message.options && message.options.unpackBody) {
    message = message.body;
  }
  const pid = credentials.projectId || '';
  const destination = topicName;
  return publishJSON(req, topic, message)
    .then(result => {
      log(req, 'publishMessage', { result, destination, topicName, message, device, type, projectId: pid });
      return result;
    })
    .catch(error => {
      log(req, 'publishMessage', { error, destination, topicName, message, device, type, projectId: pid });
      return error;  //  Suppress the error.
    });
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
  const duration = timestamp ? (parseInt((end - timestamp) / 100, 10) / 10.0) : 0;
  //  Compute the latency between queues in second with 1 decimal place.
  const lastSend = (message.history.length > 0)
    ? message.history[message.history.length - 1].end
    : null;  //  Get the last send time.
  const latency = lastSend ? (parseInt((timestamp - lastSend) / 100, 10) / 10.0) : 0;
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
    .then(() => dispatchMessage(req, updatedMessage, device))
    .catch((error) => { throw error; });
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
  req.uuid = body ? body.uuid : 'missing_uuid';
  if (message.isDispatched) delete message.isDispatched;
  log(req, 'start', { device, body, event, message, googleCredentials });

  //  If the message is already processed by another server, skip it.
  return isProcessedMessage(req, message)
    .then(isProcessed => (
      isProcessed
        ? log(req, 'skip', { result: message, isProcessed, device, body, event, message })
        //  Else wait for the task to complete then dispatch the next step.
        : runTask(req, event, task, device, body, message)
    ))
    //  Log the final result i.e. the dispatched message.
    .then(result => log(req, 'end', { result, device, body, event, message }))
    //  Suppress all errors else Google will retry the message.
    .catch(error => log(req, 'end', { error, device, body, event, message }));
}

module.exports = {
  projectId: process.env.GCLOUD_PROJECT,
  functionName: process.env.FUNCTION_NAME || 'unknown_function',
  getCredentials: () => googleCredentials,
  sleep,
  log,
  error: log,
  flushLog,
  logQueueConfig: [],   //  Log to PubSub: array of { projectId, topicName }
  logQueue,
  publishMessage,
  updateMessageHistory,
  dispatchMessage,
  main,
  //  If required, remap the projectId and topicName to deliver to another queue.
  transformRoute: (req, type, device, credentials, topicName) =>
    ({ credentials: Object.assign({}, credentials), topicName }),
};
