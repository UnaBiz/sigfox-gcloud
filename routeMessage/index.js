//  Google Cloud Function routeMessage is trigger when a Sigfox message is sent
//  to sigfox.devices.all, the Google PubSub queue for all devices.
//  We set the Sigfox message route according to the device ID.
//  The route is stored in the Google Cloud Metadata store.

//  Try not to call any database that may cause this function to fail
//  under heavy load.  High availability of this Cloud Function is
//  essential in order to route every Sigfox message properly.

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
const stringify = require('json-stringify-safe');

//  A route is an array of strings.  Each string indicates the next processing step,
//  e.g. ['decodeStructuredMessage', 'logToGoogleSheets'].

//  The route is stored in this key in the Google Cloud Metadata store.
const defaultRouteKey = 'sigfox-route';
const routeExpiry = 10 * 1000;  //  Routes expire in 10 seconds.

let defaultRoute = null;        //  The cached route.
let defaultRouteExpiry = null;  //  Cache expiry timestamp.

//  End Common Declarations
//  //////////////////////////////////////////////////////////////////////////////////////////

//  //////////////////////////////////////////////////////////////////////////////////////////
//  Begin Message Processing Code

function wrap() {
  //  Wrap the module into a function so that all Google Cloud resources are properly disposed.
  const sgcloud = require('sigfox-gcloud'); //  sigfox-gcloud Framework
  const googlemetadata = require('sigfox-gcloud/lib/google-metadata');

  function getRoute(req) {
    //  Fetch the route from the Google Cloud Metadata store, which is easier
    //  to edit.  Previously we used a hardcoded route.
    //  Refresh the route every 10 seconds in case it has been updated.
    //  Returns a promise.

    //  Return the cached route if not expired.
    if (defaultRoute && defaultRouteExpiry >= Date.now()) return Promise.resolve(defaultRoute);
    //  Extend the expiry temporarily so we don't have 2 concurrent requests to fetch the route.
    if (defaultRoute) defaultRouteExpiry = Date.now() + routeExpiry;
    let authClient = null;
    // let metadata = null;
    //  Get a Google auth client.
    return googlemetadata.authorizeMetadata(req)
      .then((res) => { authClient = res; })
      //  Get the project metadata.
      .then(() => googlemetadata.getMetadata(req, authClient))
      //  .then((res) => { metadata = res; })
      //  Convert the metadata to a JavaScript object.
      //  .then(() => googlemetadata.convertMetadata(req, metadata))
      //  Return the default route from the metadata.
      .then(metadataObj => metadataObj[defaultRouteKey])
      .then((res) => {
        //  Cache for 10 seconds.
        //  result looks like 'decodeStructuredMessage,logToGoogleSheets'
        //  Convert to ['decodeStructuredMessage', 'logToGoogleSheets']
        const result = res.split(' ').join('').split(',');  //  Remove spaces.
        defaultRoute = result;
        defaultRouteExpiry = Date.now() + routeExpiry;
        sgcloud.log(req, 'getRoute', { result, device: req.device });
        return result;
      })
      .catch((error) => {
        sgcloud.log(req, 'getRoute', { error, device: req.device });
        //  In case of error, reuse the previous route if any.
        if (defaultRoute) return defaultRoute;
        throw error;
      });
  }

  //  TODO: Fetch route upon startup.  In case of error, try later.
  // setTimeout(() =>
  //  getRoute({}).catch(() => 'OK'),
  //  1000);  //  Must wait 1 second or will hit network errors.

  function routeMessage(req, device, body, msg0) {
    //  Set the message route according to the map and device ID.
    //  message = { device, type, body, query }
    //  Returns a promise.
    const msg = Object.assign({}, msg0);
    return getRoute(req)
      .then((route) => {
        //  Must clone the route because it might be mutated accidentally.
        msg.route = JSON.parse(stringify(route || []));
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
    return routeMessage(req, device, body, msg)
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
