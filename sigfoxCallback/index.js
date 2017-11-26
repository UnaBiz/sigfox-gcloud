/* eslint-disable max-len, camelcase, no-console, no-nested-ternary, import/no-dynamic-require, import/newline-after-import, import/no-unresolved, global-require, max-len */
//  //////////////////////////////////////////////////////////////////////////////////// endregion
//  region AWS AutoInstall: List all dependencies here, or just paste the contents of package.json. Autoinstall will install these dependencies.
const package_json = /* eslint-disable quote-props,quotes,comma-dangle,indent */
//  PASTE PACKAGE.JSON BELOW  //////////////////////////////////////////////////////////
{ "dependencies": {
  "dnscache": "^1.0.1",
  "sigfox-aws": ">=1.0.10",
  "uuid": "^3.1.0" } }
//  PASTE PACKAGE.JSON ABOVE  //////////////////////////////////////////////////////////
; /* eslint-enable quote-props,quotes,comma-dangle,indent */

//  Google Cloud Function sigfoxCallback is exposed as a HTTPS service
//  that Sigfox Cloud will callback when delivering a Sigfox message.
//  We insert the Sigfox message into Google PubSub message queues:
//  (1) sigfox.devices.all (the queue for all devices)
//  (2) sigfox.devices.<deviceID> (the device specific queue)
//  (3) sigfox.types.<deviceType> (the specific device type e.g. gps)

//  We will return the HTTPS response immediately to Sigfox Cloud while
//  the processing of the Sigfox continues with other Google Cloud Functions.

//  This code is critical, all changes must be reviewed.  It must be
//  kept as simple as possible to reduce the chance of failure.

//  //////////////////////////////////////////////////////////////////////////////////// endregion
//  region Common Declarations

//  Helper constants to detect if we are running on Google Cloud or AWS.
const isGoogleCloud = !!process.env.FUNCTION_NAME || !!process.env.GAE_SERVICE;
const isAWS = !!process.env.AWS_LAMBDA_FUNCTION_NAME; // eslint-disable-next-line no-unused-vars
const isProduction = (process.env.NODE_ENV === 'production');  //  True on production server.

process.on('uncaughtException', err => console.error('uncaughtException', err.message, err.stack));  //  Display uncaught exceptions.
process.on('unhandledRejection', (reason, p) => console.error('unhandledRejection', reason, p));
if (isGoogleCloud) {  //  Start agents for Google Cloud.
  if (!process.env.DISABLE_DNSCACHE) require('dnscache')({ enable: true });  //  Enable DNS cache in case we hit the DNS quota for Google Cloud Functions.
  if (!process.env.DISABLE_TRACE) require('@google-cloud/trace-agent').start();  //  Must enable Google Cloud Tracing before other require()
  if (!process.env.DISABLE_DEBUG) require('@google-cloud/debug-agent').start();  //  Must enable Google Cloud Debug before other require()
}

//  //////////////////////////////////////////////////////////////////////////////////// endregion
//  region Message Processing Code

function wrap(/* package_json */) {
  //  Wrap the module into a function so that all we defer loading of dependencies,
  //  and ensure that cloud resources are properly disposed.
  const scloud = // eslint-disable-next-line import/no-extraneous-dependencies
    isGoogleCloud ? require('sigfox-gcloud') :  //  sigfox-gcloud Framework
    isAWS ? require('sigfox-aws') :  //  sigfox-aws Framework
    null;
  const uuid = require('uuid');
  let wrapCount = 0;

  function getResponse(req, device0, body /* , msg */) {
    //  Compose the callback response to Sigfox Cloud and return as a promise.
    //  If body.ack is true, then we must wait for the result and return to Sigfox as the downlink data.
    //  Else tell Sigfox we will not be returning any downlink data.
    //  This lets us route the Sigfox message to another Cloud Function
    //  for processing, without Sigfox Cloud waiting for us.
    const device = device0 || 'missing_device';
    const response = {};
    if (body.ack === false || body.ack === 'false') {
      //  No downlink needed.
      response[device] = { noData: true };
      return Promise.resolve(response);
    }
    //  Wait for the result.  Must be 8 bytes hex.
    //  TODO: We hardcode the result for now.
    const result = '0123456789abcdef';
    if (result.length !== 16) throw new Error(`Result must be 8 bytes: ${result}`);
    Array.from(result.toLowerCase()).forEach((s) => {
      if (s[0] < '0' || s[0] > 'f' || (s[0] > '9' && s[0] < 'a')) {
        throw new Error(`Invalid hex digit in result: ${s[0]}`);
      }
    });
    response[device] = { downlinkData: result };
    return Promise.resolve(response);
  }

  function saveMessage(req, device, type, body, rootTraceId) {
    //  Save the received message for processing by other modules.
    //  TODO: The message saving logic is currently different for AWS and Google Cloud:
    //
    //  For AWS: Save the received message to sigfox.received queue.
    //
    //  For Google Cloud: Save the message to Google PubSub in 3 message queues:
    //  (1) sigfox.devices.all (the queue for all devices)
    //  (2) sigfox.devices.<deviceID> (the device specific queue)
    //  (3) sigfox.types.<deviceType> (the specific device type e.g. gps)
    //
    //  There may be another Cloud Function waiting on sigfox.received or sigfox.devices.all
    //  to process this message e.g. routeMessage.
    //  Where does device type come from?  It's specified in the callback URL
    //  e.g. https://myproject.appspot.com?type=gps
    scloud.log(req, 'saveMessage', { device, type, body, rootTraceId });
    const queues = [];
    const query = req.query;
    //  Compose the message and record the history.
    const message0 = { device, type, body, query, rootTraceId };
    const message = scloud.updateMessageHistory(req, message0, device);
    if (isGoogleCloud) {
      //  For Google Cloud: Send to 3 queues...
      queues.push({ device: 'all' });  //  sigfox.devices.all (the queue for all devices)
      if (type) queues.push({ type });  //  sigfox.types.<deviceType>
      //  This queue may not exist and cause errors, so we send last.
      if (device) queues.push({ device });  //  sigfox.devices.<deviceID> (the device specific queue)
    } else if (isAWS) {
      //  For AWS: Send to 1 queues - sigfox.received.
      //  We will deliver to the above 3 queues after all the routes have run.
      queues.push({ device: null, type: null });  //  (null,null) means "sigfox.received"
    }
    //  Get a list of promises, one for each publish operation to each queue.
    let promises = Promise.resolve('start');
    for (const queue of queues) {
      //  Send message to each queue, either the device ID or message type queue.
      const promise = scloud.publishMessage(req, message, queue.device, queue.type)
        .catch((error) => {
          scloud.log(req, 'saveMessage', { error, device, type, body, rootTraceId });
          return error;  //  Suppress the error so other sends can proceed.
        });
      promises = promises.then(() => promise);
    }
    //  Wait for the messages to be published to the queues.
    return promises
      //  Return the message with dispatch flag set so we don't resend.
      .then(() => scloud.log(req, 'saveMessage', { result: message, device, type, body, rootTraceId }))
      .then(() => Object.assign({}, message, { isDispatched: true }))
      .catch((error) => { throw error; });
  }

  function parseBool(s) {
    //  Parse a string to boolean.
    return s === 'true';
  }

  function parseSIGFOXMessage(req, body0) {  /* eslint-disable no-param-reassign */
    //  Convert Sigfox body from string to native types.
    /* body contains (Callbacks -> Body):  Example:
     {                                      {
     "device" : "{device}",               "device":"1CB0B8",
     "data" : "{data}",                   "data":"81543795",
     "time" : "{time}",                   "time":"1476980426",
     "duplicate": "{duplicate}",          "duplicate":"false",
     "snr": "{snr}",                      "snr":"18.86",
     "station": "{station}",              "station":"1D44",
     "avgSnr": "{avgSnr}",                "avgSnr":"15.54",
     "lat": "{lat}",                      "lat":"1",
     "lng": "{lng}",                      "lng":"104",
     "rssi": "{rssi}",                    "rssi":"-123.00",
     "seqNumber": "{seqNumber}",          "seqNumber":"1492",
     "ack": "{ack}",                      "ack":"false",
     "longPolling": "{longPolling}"       "longPolling":"false"
     }                                      }
     */
    const body = Object.assign({}, body0);  //  Clone the body.
    if (body.time) {
      body.time = parseInt(body.time, 10);  //  Milliseconds.
      body.timestamp = `${body.time * 1000}`;
      //  Delete "time" field because it's a special field in InfluxDB.
      body.baseStationTime = body.time;
      delete body.time;
    }
    //  Convert the text fields to boolean, int, float.
    if (body.duplicate) body.duplicate = parseBool(body.duplicate);
    if (body.snr) body.snr = parseFloat(body.snr);
    if (body.avgSnr) body.avgSnr = parseFloat(body.avgSnr);
    if (body.lat) body.lat = parseInt(body.lat, 10);
    if (body.lng) body.lng = parseInt(body.lng, 10);
    if (body.rssi) body.rssi = parseFloat(body.rssi);
    if (body.seqNumber) body.seqNumber = parseInt(body.seqNumber, 10);
    if (body.ack) body.ack = parseBool(body.ack);
    if (body.longPolling) body.longPolling = parseBool(body.longPolling);
    return body;
  } /* eslint-enable no-param-reassign */

  function messageExpired(body) {
    //  Return true if message is too old (5 mins or older).
    //  Only check for AWS, not Google Cloud.
    if (!isAWS) return false;
    if (!body.baseStationTime) return false;
    const baseStationTime = parseInt(body.baseStationTime, 10);
    //  Compute time diff in minutes.
    const age = (Date.now() - (baseStationTime * 1000.0)) / (60.0 * 1000);
    if (age > 5.0) {
      Object.assign(body, { age });
      return true;
    }
    return false;
  }

  function task(req, device, body0, msg) {
    //  Parse the Sigfox fields and send to the queues for device ID and device type.
    //  Then send the HTTP response back to Sigfox cloud.  If there is downlink data, wait for the response.
    let result = msg;
    let rejectMessage = false;  //  Set to true if we should reject the message.
    let response = 'OK';  //  Response to Sigfox.
    const res = req.res;
    const type = msg.type;
    const rootTraceId = msg.rootTraceId;
    //  Convert the text fields into number and boolean values.
    const body = parseSIGFOXMessage(req, body0);
    const seqNumber = body.seqNumber;
    const localdatetime = body.localdatetime;
    const baseStationTime = body.baseStationTime;
    //  Only for AWS: Check whether message is too old. If older than 5 mins, reject. This helps to flush the queue of pending requests.
    if (messageExpired(body)) {
      rejectMessage = true;
      const error = new Error(`Rejecting old message: ${body.age.toFixed(1)} mins diff`);
      scloud.error(req, 'task', { error, device, seqNumber, localdatetime, baseStationTime });
    }
    //  If not rejected, send the Sigfox message to the queues.
    return (rejectMessage
      ? Promise.resolve(null)  //  Pass null to next step if rejected.
      : saveMessage(req, device, type, body, rootTraceId).catch(scloud.dumpError))  // Else send the message.
      //  Save the result if not null.
      .then((newMessage) => { if (newMessage) result = newMessage; })
      .catch(scloud.dumpError)
      //  Wait for the downlink data if any.
      .then(() => getResponse(req, device, body0, msg))
      .then((resp) => { response = resp; })
      .catch(scloud.dumpError)
      //  Log the final result, then flush the log and wait for it to be deallocated.
      //  After this point, don't use scloud.log since the log has been flushed.
      .then(() => scloud.log(req, 'result', { result, device, body }))
      .then(() => scloud.endTask(req).catch(scloud.dumpError))
      //  Return the response to Sigfox Cloud and terminate the Cloud Function.
      //  Sigfox needs HTTP code 204 to indicate downlink.
      .then(() => res.status(204).json(response).end())
      .then(() => result);
  }

  function main(para1, para2, para3) {
    //  This function is exposed as a HTTP request to handle callbacks from
    //  Sigfox Cloud.  The Sigfox message is contained in the request.body.
    //  Get the type from URL e.g. https://myproject.appspot.com?type=gps
    console.log({ wrapCount }); wrapCount += 1;  //  Count how many times the wrapper was reused.
    //  Google Cloud and AWS pass parameters differently.
    //  We send to the respective modules to decode.
    const para = scloud.init(para1, para2, para3);
    const req = para.req;  //  HTTP Request Interface
    // const res = para.res;  //  HTTP Response Interface
    req.starttime = Date.now();
    //  Start a root-level span to trace the request across Cloud Functions.
    const rootTrace = scloud.startRootSpan(req).rootTrace;
    const rootTraceId = rootTrace ? rootTrace.traceId : null;  //  Pass to other Cloud Functions.
    req.rootTraceId = rootTraceId;

    const event = null;
    const type = (req.query && req.query.type) || null;
    const uuid0 = uuid.v4();  //  Assign a UUID for message tracking.
    const callbackTimestamp = Date.now();  //  Timestamp for callback.
    const datetime = new Date(callbackTimestamp)
      .toISOString().replace('T', ' ')
      .substr(0, 19); //  For logging to Google Sheets.
    const localdatetime = new Date(callbackTimestamp + (8 * 60 * 60 * 1000))
      .toISOString().replace('T', ' ')
      .substr(0, 19); //  For convenience in writing AWS IoT Rules.
    //  Save the UUID, datetime and callback timestamp into the message.
    const body = Object.assign({ uuid: uuid0, datetime, localdatetime, callbackTimestamp },
      req.body);
    //  Get the device ID.
    const device = (body.device && typeof body.device === 'string')
      ? body.device.toUpperCase()
      : req.query.device
        ? req.query.device.toUpperCase()
        : null;
    const oldMessage = { device, body, type, rootTraceId };
    let updatedMessage = oldMessage;
    scloud.log(req, 'start', { device, body, event, rootTraceId });

    //  Now we run the task to publish the message to the queues.
    //  Wait for the publish task to complete.
    return task(req, device, body, oldMessage)
      //  At the point, don't use common.log since the log has been flushed.
      //  The response has been closed so the Cloud Function will terminate soon.
      //  Don't do any more processing here.
      .then((result) => { updatedMessage = result; })
      .catch(scloud.dumpError)
      //  Return the updated message.
      .then(() => updatedMessage);
  }

  //  Expose these functions outside of the wrapper.  main() is called to execute
  //  the wrapped function when the dependencies and wrapper have been loaded.
  return { main };
}

//  //////////////////////////////////////////////////////////////////////////////////// endregion
//  region Standard Code for AutoInstall Startup Function.  Do not modify.  https://github.com/UnaBiz/sigfox-aws/blob/master/autoinstall.js
/* eslint-disable camelcase,no-unused-vars,import/no-absolute-path,import/no-unresolved,no-use-before-define,global-require,max-len,no-tabs,brace-style */
const wrapper = {};  //  The single reused wrapper instance (initially empty) for invoking the module functions.
exports.main = isGoogleCloud ? require('sigfox-gcloud/lib/main').getMainFunction(wrapper, wrap, package_json)
  : (event, context, callback) => { //  exports.main is the startup function for AWS Lambda and Google Cloud Function.
    //  When AWS starts our Lambda function, we load the autoinstall script from GitHub to install any NPM dependencies.
    //  For first run, install the dependencies specified in package_json and proceed to next step.
    //  For future runs, just execute the wrapper function with the event, context, callback parameters.
    const afterExec = error => error ? callback(error, 'AutoInstall Failed')
      : require('/tmp/autoinstall').installAndRunWrapper(event, context, callback,
        package_json, __filename, wrapper, wrap);
    if (require('fs').existsSync('/tmp/autoinstall.js')) return afterExec(null);  //  Already downloaded.
    const cmd = 'curl -s -S -o /tmp/autoinstall.js https://raw.githubusercontent.com/UnaBiz/sigfox-aws/master/autoinstall.js';
    const child = require('child_process').exec(cmd, { maxBuffer: 1024 * 500 }, afterExec);
    child.stdout.on('data', console.log); child.stderr.on('data', console.error); return null; };
//  //////////////////////////////////////////////////////////////////////////////////// endregion
