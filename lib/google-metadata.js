//  Get and set Google Cloud common instance metadata.
//  This is a key-value store that's shared by all programs running in the
//  same Google Cloud project.  Note the limit of 32768 bytes for each
//  individual metadata entry and 512KB for the total metadata server.
const isGoogleCloud = !!(process.env.GAE_SERVICE || process.env.FUNCTION_NAME);
const google = require('googleapis');
const common = require('../index');
const credentials = isGoogleCloud ? null : require('../google-credentials.json');

const scopes = ['https://www.googleapis.com/auth/cloud-platform'];
const compute = google.compute('v1');

function authorize(req, scopes0) {
  //  Return an authClient for getting and setting metadata.
  //  Returns a promise.
  const scopes2 = scopes0 || scopes;
  return new Promise((resolve, reject) => {
    const callback = (err, res) => (err ? reject(err) : resolve(res));
    return isGoogleCloud
      //  If running in cloud, use default cloud credentials.
      ? google.auth.getApplicationDefault(callback)
      //  Else use service account credentials.
      : google.auth.fromJSON(credentials, callback);
  })
    .then((authClient0) => {
      let authClient = authClient0;
      if (authClient.createScopedRequired && authClient.createScopedRequired()) {
        authClient = authClient.createScoped(scopes2);
      }
      common.log(req, 'google-metadata/authorize', { result: 'OK', scopes2 });
      return authClient;
    })
    .catch((error) => {
      common.log(req, 'google-metadata/authorize', { error, scopes2 });
      throw error;
    });
}

function convertMetadata(req, metadata) {
  //  Given metadata = { "fingerprint": "yiXZGhVkCGQ=",
  //    "items": [{"key": "a", "value": "1"}, ...]}
  //  return as a Javascript object {a:1, ...}
  const result = {};
  for (const item of metadata.items || []) {
    const key = item.key;
    result[key] = item.value;
  }
  return result;
}

function updateMetadata(req, metadata, updateObj) {
  /* metadata contains: { "fingerprint": "yiXZGhVkCGQ=",
   "items": [{"key": "a", "value": "1"}, ...]}
   Return a new copy of metadata with items updated to the key=value pairs in updateObj. */
  const updatedItems = [];
  let updateKeys = Object.keys(updateObj);
  for (const item of metadata.items || []) {
    //  Look for a key in updateObj that is present in item.
    const key = item.key;
    if (updateKeys.indexOf(key) >= 0) {
      //  Output the new value according to updateObj and remove from the keys.
      const value = updateObj[key];
      updatedItems.push({ key, value });
      updateKeys = updateKeys.filter(x => (x !== key));
    } else {
      //  Key doesn't exist in updateObj. Just copy over.
      updatedItems.push(item);
    }
  }
  //  Update the remaining keys not found in metadata.
  for (const key of updateKeys) {
    const value = updateObj[key];
    updatedItems.push({ key, value });
  }
  const result = Object.assign({}, metadata);
  result.items = updatedItems;
  return result;
}

function composeRequest(req, authClient) {
  //  Return a standard request template for making metadata requests.
  const request = {
    project: process.env.GCLOUD_PROJECT,  //  Google Cloud project ID.
    auth: authClient,
  };
  return request;
}

function getProjectMetadata(req, authClient) {
  //  Return the common instance metadata for the Google Cloud project:
  //  { "fingerprint": "yiXZGhVkCGQ=",
  //    "items": [{"key": "a", "value": "1"}, ...]}
  //  Returns a promise.
  const request = composeRequest(req, authClient);
  return new Promise((resolve, reject) =>
      compute.projects.get(request, (err, res) =>
        (err ? reject(err) : resolve(res))))
    .then((res) => {
      //  Remove the "kind" field.  Leave only "fingerprint" and "items".
      const result = Object.assign({}, res.commonInstanceMetadata);
      if (result.kind) delete result.kind;
      common.log(req, 'google-metadata/getProjectMetadata', { result });
      return result;
    })
    .catch((error) => {
      common.log(req, 'google-metadata/getProjectMetadata', { error });
      throw error;
    });
}

function setProjectMetadata(req, authClient, metadata) {
  //  Set the common instance metadata for the Google Cloud project.
  //  metadata contains: { "fingerprint": "yiXZGhVkCGQ=",
  //    "items": [{"key": "a", "value": "1"}, ...]}
  //  Note the limit of 32768 bytes for each individual metadata entry
  //  and 512KB for the total metadata server.  Returns a promise.
  const request = composeRequest(req, authClient);
  request.resource = Object.assign({}, metadata);
  //  Delete the etag if it exists.
  if (request.resource.etag) delete request.resource.etag;
  return new Promise((resolve, reject) =>
    compute.projects.setCommonInstanceMetadata(request, (err, res) =>
      (err ? reject(err) : resolve(res))))
    .then((result) => {
      common.log(req, 'google-metadata/setProjectMetadata', { result, metadata });
      return result;
    })
    .catch((error) => {
      common.log(req, 'google-metadata/setProjectMetadata', { error, metadata });
      throw error;
    });
}

module.exports = {
  authorize,
  convertMetadata,
  updateMetadata,
  getProjectMetadata,
  setProjectMetadata,
};
