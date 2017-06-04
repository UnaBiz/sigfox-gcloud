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
const sgcloud = require('sigfox-gcloud');
const googlemetadata = require('sigfox-gcloud/lib/google-metadata');

//  A route is an array of strings.  Each string indicates the next processing step,
//  e.g. ['decodeStructuredMessage', 'logToGoogleSheets'].

//  The route is stored in this key in the Google Cloud Metadata store.
const defaultRouteKey = 'sigfox-route';
const routeExpiry = 10 * 1000;  //  Routes expire in 10 seconds.

let defaultRoute = null;        //  The cached route.
let defaultRouteExpiry = null;  //  Cache expiry timestamp.

function getRoute(req) {
  //  Fetch the route from the Google Cloud Metadata store, which is easier
  //  to edit.  Previously we used a hardcoded route.
  //  Refresh the route every 10 seconds in case it has been updated.
  //  Returns a promise.

  //  Return the cached route if not expired.
  if (defaultRoute && defaultRouteExpiry >= Date.now()) return defaultRoute;
  let authClient = null;
  let metadata = null;
  //  Get a Google auth client.
  return googlemetadata.authorize(req)
    .then((res) => { authClient = res; })
    //  Get the project metadata.
    .then(() => googlemetadata.getProjectMetadata(req, authClient))
    .then((res) => { metadata = res; })
    //  Convert the metadata to a JavaScript object.
    .then(() => googlemetadata.convertMetadata(req, metadata))
    //  Return the default route from the metadata.
    .then(metadataObj => metadataObj[defaultRouteKey])
    .then((res) => {
      //  Cache for 10 seconds.
      //  result looks like 'decodeStructuredMessage,logToGoogleSheets'
      //  Convert to ['decodeStructuredMessage', 'logToGoogleSheets']
      const result = res.split(' ').join('').split(',');  //  Remove spaces.
      defaultRoute = result;
      defaultRouteExpiry = Date.now() + routeExpiry;
      sgcloud.log(req, 'getRoute', { result });
      return result;
    })
    .catch((error) => {
      sgcloud.log(req, 'getRoute', { error });
      //  In case of error, reuse the previous route if any.
      if (defaultRoute) return defaultRoute;
      throw error;
    });
}

//  Fetch route upon startup.  In case of error, try later.
setTimeout(() =>
  getRoute({}).catch(() => 'OK'),
  1000);  //  Must wait 1 second or will hit network errors.

function routeMessage(req, device, body, msg0) {
  //  Set the message route according to the map and device ID.
  //  message = { device, type, body, query }
  //  Returns a promise.
  const msg = Object.assign({}, msg0);
  return getRoute(req)
    .then((route) => {
      //  Must clone the route because it might be mutated accidentally.
      msg.route = JSON.parse(JSON.stringify(route || []));
      const result = msg;
      sgcloud.log(req, 'routeMessage', { result, route, device, body, msg });
      return result;
    })
    .catch((error) => {
      sgcloud.log(req, 'routeMessage', { error, device, body, msg });
      throw error;
    });
}

function task(req, device, body, msg) {
  //  The task for this Google Cloud Function:
  //  Set the route for the Sigfox message depending on device ID.
  //  The route is saved into the "route" field of the Sigfox message.
  return routeMessage(req, device, body, msg);
}

//  When this Google Cloud Function is triggered, we call main() then task().
exports.main = event => sgcloud.main(event, task);
