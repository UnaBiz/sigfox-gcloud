//  Google Cloud Function routeMessage is trigger when a Sigfox message is sent
//  to sigfox.devices.all, the Google PubSub queue for all devices.
//  We set the Sigfox message route according to the device ID.

//  For safety we hardcode the route here.  Each route looks like
//    [ decodeStructuredMessage, logToGoogleSheets, ... ]
//  which are the Google Cloud Functions to be called sequentially.

//  Try not to call any database that may cause this function to fail
//  under heavy load.  High availability of this Cloud Function is
//  essential in order to route every Sigfox message properly.

/* eslint-disable camelcase, no-console, no-nested-ternary, import/no-dynamic-require,
 import/newline-after-import, import/no-unresolved, global-require, max-len */
if (process.env.FUNCTION_NAME) {
  //  Load the Google Cloud Trace and Debug Agents before any require().
  //  Only works in Cloud Function.
  require('@google-cloud/trace-agent').start();
  require('@google-cloud/debug-agent').start();
}
const sigfoxgcloud = require('sigfox-gcloud');

//  Map device ID to route [ msgType1, msgType2, .... ]
//  This is hardcoded here so it can never fail e.g. due to database failure.
const mapDeviceToRoute = require('./routes');

//  This validated map will be used to map device ID to route.
let validatedMapDeviceToRoute = null;

function validateMap(req) {
  //  Construct an efficient map to map device ID to route.
  if (validatedMapDeviceToRoute) return validatedMapDeviceToRoute;
  const mapCopy = JSON.parse(JSON.stringify(mapDeviceToRoute));
  const map = {};
  for (const deviceRoute of mapCopy) {
    const devices = deviceRoute.devices;
    const route = deviceRoute.route;
    for (const device0 of devices) {
      //  Map the device ID to the route.
      const device = device0.trim().toUpperCase();
      if (!map[device]) map[device] = [];
      for (const type of route) {
        //  Don't map if already mapped.
        if (map[device].indexOf(type) >= 0) continue;
        map[device].push(type);
      }
    }
  }
  sigfoxgcloud.log(req, 'validateMap', { map });
  validatedMapDeviceToRoute = map;
  return validatedMapDeviceToRoute;
}
validateMap({});  //  Construct the map upon startup.

function routeMessage(req, device, body, msg0) {
  //  Set the message route according to the map and device ID.
  //  message = { device, type, body, query }
  //  Returns a promise.
  const msg = Object.assign({}, msg0);
  //  log(req, 'routeMessage', { device, body, msg });
  const map = validateMap(req);
  const route = map[device] || [];
  //  Must clone the route because it might be mutated accidentally.
  msg.route = JSON.parse(JSON.stringify(route));
  const result = msg;
  sigfoxgcloud.log(req, 'routeMessage', { result, route, device, body, msg });
  return Promise.resolve(result);
}

function task(req, device, body, msg) {
  //  The task for this Google Cloud Function:
  //  Set the route for the Sigfox message depending on device ID.
  //  The route is saved into the "route" field of the Sigfox message.
  return routeMessage(req, device, body, msg);
}

//  When this Google Cloud Function is triggered, we call main() then task().
exports.main = event => sigfoxgcloud.main(event, task);
