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

/* eslint-disable camelcase, no-console, no-nested-ternary, import/no-dynamic-require, import/newline-after-import, import/no-unresolved, global-require, max-len */
//  Helper constants to detect if we are running on Google Cloud or AWS.
const isGoogleCloud = !!process.env.FUNCTION_NAME || !!process.env.GAE_SERVICE;
const isAWS = !!process.env.AWS_LAMBDA_FUNCTION_NAME;

if (isGoogleCloud) require('dnscache')({ enable: true });  //  Enable DNS cache in case we hit the DNS quota for Google Cloud Functions.
process.on('uncaughtException', err => console.error(err.message, err.stack));  //  Display uncaught exceptions.
process.on('unhandledRejection', (reason, p) => console.error('Unhandled Rejection at:', p, 'reason:', reason));
if (isGoogleCloud) {
  //  Load the Google Cloud Trace and Debug Agents before any require().
  //  Only works in Cloud Function.
  require('@google-cloud/trace-agent').start();
  require('@google-cloud/debug-agent').start();
}

//  The single wrapper instance for invoking the module functions.
let wrapper = null;

//  //////////////////////////////////////////////////////////////////////////////////// endregion
//  region AWS AutoInstall: List all dependencies here, or just paste the contents of package.json. Autoinstall will install these dependencies.

const package_json = /* eslint-disable quote-props,quotes,comma-dangle,indent */
//  PASTE PACKAGE.JSON BELOW  //////////////////////////////////////////////////////////
  {
    "name": "sigfoxCallback",
    "version": "0.0.1",
    "author": {
      "name": "Lee Lup Yuen",
      "email": "ly.lee@unabiz.com",
      "url": "http://github.com/unabiz/"
    },
    "license": "MIT",
    "engines": {
      "node": ">=6.7.0"
    },
    "dependencies": {
      "dnscache": "^1.0.1",
      "dotenv": "^4.0.0",
      "sigfox-aws": ">=0.0.34",
      "safe-buffer": "5.0.1",
      "node-fetch": "^1.6.3",
      "json-stringify-safe": "^5.0.1",
      "uuid": "^3.1.0"
    },
    "repository": {
      "type": "git",
      "url": "git+https://github.com/UnaBiz/sigfox-aws.git"
    }
  }
//  PASTE PACKAGE.JSON ABOVE  //////////////////////////////////////////////////////////
; /* eslint-enable quote-props,quotes,comma-dangle,indent */

//  //////////////////////////////////////////////////////////////////////////////////// endregion
//  region Google Cloud Startup

if (isGoogleCloud) {
  //  Create the wrapper and expose the wrapped functions.
  if (!wrapper) wrapper = wrap();
  exports = { main: wrapper.main };
}

//  //////////////////////////////////////////////////////////////////////////////////// endregion
//  region AWS Lambda Startup

const mainReq = {};
const mainRes = {
  status: (/* code */) => mainRes,  //  TODO
  json: (/* json */) => mainRes,  //  TODO
  end: () => mainRes,
};

function prepareRequest(body) {
  //  Prepare the request and result objects.
  mainReq.body = body;
  /* mainReq.body looks like {
    device: '1A2345',
    data: 'b0513801a421f0019405a500',
    time: '1507112763',
    duplicate: 'false',
    snr: '18.86',
    station: '1D44',
    avgSnr: '15.54',
    lat: '1',
    lng: '104',
    rssi: '-123.00',
    seqNumber: '1508',
    ack: 'false',
    longPolling: 'false',
  }; */
}

// eslint-disable-next-line arrow-body-style
if (isAWS) exports.handler = (event, context, callback) => {
  console.log(JSON.stringify({ event, env: process.env }, null, 2));
  //  We will call "done" to return a JSON response.
  const done = (err, res) => callback(null, {
    statusCode: err ? '400' : '200',
    body: err ? err.message : JSON.stringify(res),
    headers: {
      'Content-Type': 'application/json',
    },
  });

  //  Install the dependencies from package_json above.  Will reload the script.
  //  eslint-disable-next-line no-use-before-define
  return autoInstall(package_json, event, context, callback)
    .then((installed) => {
      if (!installed) return null;  //  Dependencies installing now.  Wait until this Lambda reloads.

      //  Dependencies loaded, so we can use require here.
      if (!wrapper) wrapper = wrap();
      //  Prepare the request and result objects.
      const body = JSON.parse(event.body);
      prepareRequest(body);  //  eslint-disable-next-line no-use-before-define
      return wrapper.main(mainReq, mainRes)
        .then(() => done(null, 'OK'))
        .catch(error => done(error, null));
    })
    .catch(error => done(error, null));
};

//  //////////////////////////////////////////////////////////////////////////////////// endregion
//  region Portable Code for Google Cloud and AWS

function wrap() {
  //  Wrap the module into a function so that all we defer loading of dependencies,
  //  and ensure that cloud resources are properly disposed.
  const scloud =
    isGoogleCloud ? require('sigfox-gcloud') :  //  sigfox-gcloud Framework
    isAWS ? require('sigfox-aws') :  //  sigfox-aws Framework
    null;
  const uuid = require('uuid');

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
    //  TODO: Save the message to sigfox.received queue.
    //  Save the message to Google PubSub in 3 message queues:
    //  (1) sigfox.devices.all (the queue for all devices)
    //  (2) sigfox.devices.<deviceID> (the device specific queue)
    //  (3) sigfox.types.<deviceType> (the specific device type e.g. gps)
    //  There may be another Google Cloud Function waiting on sigfox.devices.all
    //  to process this message e.g. routeMessage.
    //  Where does type come from?  It's specified in the callback URL
    //  e.g. https://myproject.appspot.com?type=gps
    scloud.log(req, 'saveMessage', { device, type, body, rootTraceId });
    const queues = [{ device: 'all' }];  //  sigfox.devices.all (the queue for all devices)
    if (type) queues.push({ type });  //  sigfox.types.<deviceType>
    //  This queue may not exist and cause errors, so we send last.
    if (device) queues.push({ device });  //  sigfox.devices.<deviceID> (the device specific queue)
    const query = req.query;
    //  Compose the message and record the history.
    const message0 = { device, type, body, query, rootTraceId };
    const message = scloud.updateMessageHistory(req, message0, device);
    //  Get a list of promises, one for each publish operation to each queue.
    const promises = [];
    for (const queue of queues) {
      //  Send message to each queue, either the device ID or message type queue.
      const promise = scloud.publishMessage(req, message, queue.device, queue.type)
        .catch((error) => {
          scloud.log(req, 'saveMessage', { error, device, type, body, rootTraceId });
          return error;  //  Suppress the error so other sends can proceed.
        });
      promises.push(promise);
    }
    //  Wait for the messages to be published to the queues.
    return Promise.all(promises)
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

  function task(req, device, body0, msg) {
    //  Parse the Sigfox fields and send to the queues for device ID and device type.
    //  Then send the HTTP response back to Sigfox cloud.  If there is downlink data, wait for the response.
    const res = req.res;
    const type = msg.type;
    const rootTraceId = msg.rootTraceId;
    //  Convert the text fields into number and boolean values.
    const body = parseSIGFOXMessage(req, body0);
    if (isAWS && body.baseStationTime) {
      const baseStationTime = parseInt(body.baseStationTime, 10);
      const age = Date.now() - (baseStationTime * 1000);
      console.log({ baseStationTime });
      if (age > 5 * 60 * 1000) {
        //  If older than 5 mins, reject.
        throw new Error(`too_old: ${age}`);
      }
    }
    let result = null;
    //  Send the Sigfox message to the queues.
    return saveMessage(req, device, type, body, rootTraceId)
      .then((newMessage) => { result = newMessage; return newMessage; })
      //  Wait for the downlink data if any.
      .then(() => getResponse(req, device, body0, msg))
      .catch(scloud.dumpError)
      //  Log the final result.
      .then(() => scloud.log(req, 'result', { result, device, body }))
      //  Flush the log and wait for it to be completed.
      //  After this point, don't use common.log since the log has been flushed.
      .then(() => scloud.endTask(req).catch(scloud.dumpError))
      //  Return the response to Sigfox Cloud and terminate the Cloud Function.
      //  Sigfox needs HTTP code 204 to indicate downlink.
      .then(response => res.status(204).json(response).end())
      .then(() => result);
  }

  function main(req0, res) {
    //  This function is exposed as a HTTP request to handle callbacks from
    //  Sigfox Cloud.  The Sigfox message is contained in the request.body.
    //  Get the type from URL e.g. https://myproject.appspot.com?type=gps
    const req = Object.assign({}, req0);  //  Clone the request.
    req.res = res;
    req.starttime = Date.now();
    //  Start a root-level span to trace the request across Cloud Functions.
    const rootTrace = scloud.startRootSpan(req).rootTrace;
    const rootTraceId = rootTrace.traceId;  //  Pass to other Cloud Functions.
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

  return {
    //  Expose these functions outside of the wrapper.
    main,
  };
}

//  //////////////////////////////////////////////////////////////////////////////////// endregion
//  region Standard Code for AutoInstall.  Do not change.  https://github.com/UnaBiz/sigfox-aws/blob/master/autoinstall.js

/* eslint-disable curly, brace-style, import/no-absolute-path */
let autoinstallPromise = null;  //  Cached autoinstall module.
function autoInstall(package_json0, event0, context0, callback0) {
  //  Set up autoinstall to install any NPM dependencies.  Returns a promise
  //  for "true" when the autoinstall has completed and the script has relaunched.
  //  Else return a promise for "false" to indicate that dependencies are being installed.
  if (__filename.indexOf('/tmp') === 0) return Promise.resolve(true);
  const sourceCode = require('fs').readFileSync(__filename);
  if (!autoinstallPromise) autoinstallPromise = new Promise((resolve, reject) => {
    //  Copy autoinstall.js from GitHub to /tmp and load the module.
    //  TODO: If script already in /tmp, use it.  Else download from GitHub.
    require('https').get(`https://raw.githubusercontent.com/UnaBiz/sigfox-aws/master/autoinstall.js?random=${Date.now()}`, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; }); // Accumulate the data chunks.
      res.on('end', () => { //  After downloading from GitHub, save to /tmp amd load the module.
        require('fs').writeFileSync('/tmp/autoinstall.js', body);
        return resolve(require('/tmp/autoinstall')); }); })
      .on('error', (err) => { autoinstallPromise = null; console.error('setupAutoInstall failed', err.message, err.stack); return reject(err); }); });
  return autoinstallPromise
    .then(mod => mod.install(package_json0, event0, context0, callback0, sourceCode))
    .then(() => false)
    .catch((error) => { throw error; });
} /* eslint-enable curly, brace-style, import/no-absolute-path */

//  //////////////////////////////////////////////////////////////////////////////////// endregion
