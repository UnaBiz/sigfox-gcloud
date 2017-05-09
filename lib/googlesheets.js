//  Log messages into Google Sheets.  Can be used in Google Cloud Function and for App Engine.
//  If running as Cloud Function, then process.env.FUNCTION_NAME is non-null.
//  If running as App Engine, then process.env.GAE_SERVICE is non-null.

//  Environment variable GCLOUD_PROJECT must be set to your Google Cloud
//  project ID e.g. export GCLOUD_PROJECT=myproject

//  Assumes sigfoxgcloud.keyfilename contains a valid Google Cloud
//  service account that has access to Sheets API and Drive API.

//  If the file .env exists in the current folder, use it to populate
//  the environment variables e.g. GCLOUD_PROJECT=myproject
/* eslint-disable max-len */
require('dotenv').load();

const stringify = require('json-stringify-safe');
const google = require('googleapis');
const common = require('../index');
/* eslint-disable import/no-unresolved */
/* process.env.GCLOUD_PROJECT
  ? require('../index')
  : require('./common'); */ /* eslint-enable import/no-unresolved */

//  Ensure the Google service account in sigfoxgcloud.keyfilename
//  has these permission scopes: Sheets API, Drive API.
const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive',
];
const sheets = google.sheets('v4');
const drive = google.drive('v3');

const sheetName = 'Log';  //  We will only read and update this sheet.
const headerRange = '1:1';  //  First row contains the header cells.
const tableRange = 'A1';  //  Table starts from this cell.
const valueInputOption = 'RAW';  //  Enter values exactly as keyed in, no interpretation.

let allSpreadsheets = null;  //  Maps filename to id.
let allSheetHeaders = {};  //  Cache the sheet headers by filename.
let allSheetRows = {};  //  Buffer when writing sheet rows, index by filename.
let authClient = null;  //  Authenticated Google API client.

function prefix(action) {
  //  For Cloud Function, log without prefix. Else log with a prefix.
  if (common.isCloudFunc) return action;
  return ['googlesheets', action].join('/');
}

function isTokenExpired(req, token) {
  //  Return true if the Google token has expired.
  if (!token) return true;
  const now = Date.now();
  //  Bring the expiry forward by 60 seconds.
  const expiry = token.credentials.expiry_date - (60 * 1000);
  if (now < expiry) return false;  //  Not expired.
  return true;
}

function getGoogleAuth(req) {
  //  Return an authenticated Google API client.  Returns a promise.

  //  If not expired, return the cached client.
  if (authClient && !isTokenExpired(req, authClient)) return Promise.resolve(authClient);
  authClient = null;
  common.log(req, prefix('getGoogleAuth'), { loading_credentials: common.keyFilename });
  /* eslint-disable import/no-unresolved, global-require, import/no-dynamic-require */
  //  Google Service Account credentials must be present inside this file.
  const googleKey = require(common.keyFilename);
    /* process.env.FUNCTION_NAME
    ? require('./google-credentials.json')    //  For Cloud Functions
    : require('../google-credentials.json');  //  For others
    */ /* eslint-enable import/no-unresolved, global-require, import/no-dynamic-require */

  //  Create a new Google API token and authorise it with the
  //  Google Drive and Google Sheets permission scopes.
  const jwtClient = new google.auth.JWT(
    googleKey.client_email,
    null,
    googleKey.private_key,
    SCOPES,
    null);
  return new Promise((accept, reject) =>
    jwtClient.authorize((error, res) =>
      error ? reject(error) : accept(res)))
    .then((/* result */) => {
      // common.log(req, prefix('getGoogleAuth'), { result });
      authClient = jwtClient;
      return jwtClient;
    })
    .catch((error) => {
      common.log(req, prefix('getGoogleAuth'), { error });
      throw error;
    });
}

function getAllSpreadsheets(req, auth) {
  //  Return all spreadsheet names and IDs accessible by the service account.
  //  Returns a promise.
  return new Promise((accept, reject) => drive.files.list({
    auth,
    corpus: 'user',
    pageSize: 100,  //  TODO: Scroll by pages.
    // q: `name='${filename}'`,
    fields: 'nextPageToken, files(id, name)',
  }, (err, response) => err ? reject(err) : accept(response)))
    .then((res) => {
      if (!res || !res.files) return null;
      const result = {};
      for (const file of res.files) {
        //  Ignore filenames with spaces or lowercase.
        if (file.name.indexOf(' ') >= 0 ||
          file.name.toUpperCase() !== file.name) {
          continue;
        }
        result[file.name] = file.id;
      }
      return result;
    })
    .catch((error) => {
      common.log(req, prefix('getAllSpreadsheets'), { error });
      throw error;
    });
}

function getSpreadsheet(req, filename) {
  //  Return the spreadsheet ID for the filename.  Returns a promise.
  if (allSpreadsheets) return Promise.resolve(allSpreadsheets[filename]);
  return getGoogleAuth(req)
    .then(auth => getAllSpreadsheets(req, auth))
    .then((res) => {
      allSpreadsheets = res;
      return allSpreadsheets[filename];
    })
    .catch((error) => {
      common.log(req, prefix('getSpreadsheet'), { error, filename });
      throw error;
    });
}

function getSheetHeader(req, filename) {
  //  Return the spreadsheet header e.g. [ 'timestamp', 'action', 'status', 'result', ...]
  //  Returns a promise.
  if (allSheetHeaders[filename]) {
    //  Return from cache to reduce Google API calls.
    const row = allSheetHeaders[filename];
    return Promise.resolve(JSON.parse(stringify(row)));
  }
  let spreadsheetId = null;
  return getSpreadsheet(req, filename)
    .then((res) => {
      spreadsheetId = res;
      if (!spreadsheetId) {
        const result = 'get_spreadsheet_failed';
        common.log(req, prefix('getSheetHeader'), { result, filename });
        return null;
      }
      return getGoogleAuth(req);
    })
    .then((auth) => {
      if (!auth) return null;
      const range = [sheetName, headerRange].join('!');
      const request = { auth, spreadsheetId, range };
      return new Promise((accept, reject) =>
        sheets.spreadsheets.values.get(request,
          (error, res) => error ? reject(error) : accept(res)));
    })
    .then((res) => {
      if (!res || !res.values || res.values.length === 0) return [];
      const rows = res.values;
      const row = JSON.parse(stringify(rows[0]));
      allSheetHeaders[filename] = JSON.parse(stringify(row));
      common.log(req, prefix('getSheetHeader'), { result: row, spreadsheetId });
      return row;
    })
    .catch((error) => {
      common.log(req, prefix('getSheetHeader'), { error, spreadsheetId });
      throw error;
    });
}

function addRow(req, spreadsheetName, values) {
  //  Append the values to the spreadsheet as a row.  Returns a promise.
  //  values = { timestamp: 'my timestamp', action: 'my action', status: 'my status', ...}
  if (!spreadsheetName || !values) return Promise.resolve(null);
  //  Get the column names from header.
  return getSheetHeader(req, spreadsheetName)
    .then((headerRow) => {
      if (!headerRow || headerRow.length === 0) {
        const result = 'file_not_found';
        common.log(req, prefix('appendRowToSheet'), { result, spreadsheetName, values: Object.keys(values).length });
        return result;
      }
      //  Find the timestamp column number, which may be labelled as timestamp+8.
      const timestampCol = headerRow.findIndex(col => col.startsWith('timestamp'));
      //  Compute the GMT offset.
      const gmtOffset = parseInt(headerRow[timestampCol].replace('timestamp', ''), 10);
      //  Find the column number of each value and populate the row by column.
      const row = [];
      for (const key of Object.keys(values)) {
        const val = values[key];
        //  For timestamp column, it may be labelled as timestamp+8 to indicate GMT+8
        if (key === 'timestamp') {
          row[timestampCol] = new Date((val ? parseInt(val, 10) : Date.now())
            + (gmtOffset * 1000 * 60 * 60))  //  Add the GMT offset hours.
            .toISOString()
            .replace('T', ' ')
            .substr(0, 19);
          continue;
        }
        const col = headerRow.indexOf(key);
        if (col < 0) {
          // console.error(`appendRowToSheet_missing_col: ${key}`);
          continue;
        }
        row[col] = val;
      }
      if (!allSheetRows[spreadsheetName]) allSheetRows[spreadsheetName] = [];
      allSheetRows[spreadsheetName].push(row);
      const result = 'OK';
      common.log(req, prefix('appendRowToSheet'), { result, spreadsheetName, values: Object.keys(values).length });
      return result;
    })
    .catch((error) => {
      common.log(req, prefix('appendRowToSheet'), { error, spreadsheetName, values: Object.keys(values).length });
      throw error;
    });
}

function flush(req, spreadsheetName) {
  //  Flush the buffer for the Google Sheet with the specified name.  Returns a promise.
  const rows = allSheetRows[spreadsheetName];
  if (!rows) return Promise.resolve(null);
  delete allSheetRows[spreadsheetName];
  let spreadsheetId = null;
  //  Lookup the spreadsheet by name.
  return getSpreadsheet(req, spreadsheetName)
    .then((res) => {
      if (!res) return null;
      spreadsheetId = res;
      //  Get a token.
      return getGoogleAuth(req);
    })
    .then((auth) => {
      if (!auth) return null;
      const range = [sheetName, tableRange].join('!');
      const resource = { values: rows };
      const request = { auth, spreadsheetId, range, valueInputOption, resource };
      //  Append the row to the spreadsheet.
      return new Promise((accept, reject) =>
        sheets.spreadsheets.values.append(request,
          (error, res2) => error ? reject(error) : accept(res2)));
    })
    .then((result) => {
      common.log(req, prefix('flushSheet'), { result, spreadsheetName, spreadsheetId, rows: rows.length });
      return result;
    })
    .catch((error) => {
      common.log(req, prefix('flushSheet'), { error, spreadsheetName, spreadsheetId, rows: rows.length });
      throw error;
    });
}

function flatten(obj) {
  //  Return obj with all nested objects flattened into 1 level.
  if (typeof obj !== 'object') return obj;
  const result = {};
  for (const key of Object.keys(obj)) {
    //  Flatten each value.
    const val = obj[key];
    if (typeof val !== 'object') {
      result[key] = val;
      continue;
    }
    //  Flatten the value then assign the flattened values to the parent.
    const flatVal = flatten(val);
    for (const flatKey of Object.keys(flatVal)) {
      result[flatKey] = flatVal[flatKey];
    }
  }
  return result;
}

function addGoogleSheetsRow(req, filename0, body0) {
  //  Used only for Mixpanel.
  //  Add a row of data to the Google Sheet with the specified name in the UnaBellLog folder.
  //  Returns a promise. body contains an array of user records, each record will be written
  //  to a new row.  filename contains the filename.  body looks like:
  //  { timestamp: 'my timestamp', action: 'my action', status: 'my status', ...}
  const body = common.isCloudFunc ? body0
    : (req.body || common.getQueryBody(req, 'body') || body0);
  if (!body) return Promise.resolve(null);
  const filename = common.isCloudFunc ? filename0
    : (common.getQueryBody(req, 'filename') || filename0);
  if (!filename) return Promise.resolve(null);
  let records = null;
  const promises = [];
  for (const key of Object.keys(body)) {
    const json = body[key];
    try {
      records = JSON.parse(json);
      if (!records) continue;
      for (const record of records) {
        //  Flatten all fields in record to a single level.
        const flatRecord = flatten(record);
        promises.push(addRow(req, filename, flatRecord));
      }
    } catch (error) {
      common.log(req, prefix('addGoogleSheetsRow'), { error, filename, body, key, records });
    }
  }
  let result = null;
  return Promise.all(promises)
    .then((res) => {
      result = res;
      return flush(req, filename);
    })
    .then(() => {
      common.log(req, prefix('addGoogleSheetsRow'), { result, filename, body, records });
      return result;
    })
    .catch((error) => {
      common.log(req, prefix('addGoogleSheetsRow'), { error, filename, body, records });
      throw error;
    });
}

function clearGoogleSheetsCache(req) {
  //  Flush the buffer then clear the cache.  Returns a promise.
  const promises = [];
  for (const spreadsheetName of Object.keys(allSheetRows)) {
    const promise = flush(req, spreadsheetName)
      .then(res => (res))
      .catch(error => (error));  //  Suppress error.
    promises.push(promise);
  }
  return Promise.all(promises)
    .then((result) => {
      allSpreadsheets = null;
      allSheetHeaders = {};
      allSheetRows = {};
      common.log(req, prefix('clearCache'), { result });
      return 'OK';
    })
    .catch((error) => {
      common.log(req, prefix('clearCache'), { error });
      throw error;
    });
}

module.exports = {
  services: {
    //  Mixpanel will post to addGoogleSheetsRow in URL encoded format.
    allowURLEncodedRequest: true,
    clearGoogleSheetsCache,
    addGoogleSheetsRow,
  },
  getGoogleAuth,
  addRow,
  flush,
};

/*
 function test() {
 const deviceID = '1C8A7E'; // 'UBUNITTEST1';
 const values = {
 data: '920e0c122731d615b0517c01',
 };
 const req = {};
 return addRow(req, deviceID, values)
 .then((res) => {
 return flush(res, deviceID);
 })
 .then((res) => {
 console.log(JSON.stringify(res, null, 2));
 });
 }
 test();

 Mixpanel format:

 users: [
 { '$distinct_id': 'a@gmail.com',
 '$properties':
 { picture: 'https://s.gravatar.com/avatar/1c1f88ee57d60690f.png',
 '$country_code': 'SG',
 '$region': 'Central Singapore Community Development Council',
 '$name': 'a@gmail.com',
 '$email': 'a@gmail.com',
 userId: 'email|58b62d9f879f18',
 '$last_seen': '2017-03-07T14:30:48',
 '$city': 'Singapore',
 '$distinct_id': '2D23A0',
 '$timezone': 'Asia/Singapore' } },
 deviceID: 'a@gmail.com' }, ... ]
 */
