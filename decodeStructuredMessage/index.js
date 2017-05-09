//  Google Cloud Function decodeStructuredMessage is triggered when a
//  Sigfox message is sent to the PubSub message queue
//  sigfox.types.decodeStructuredMessage.
//  We decode the structured sensor data inside the Sigfox message,
//  sent by unabiz-arduino library, containing field names and values.

//  See this for the definition of structured messages:
//  https://github.com/UnaBiz/unabiz-arduino/wiki/UnaShield

/* eslint-disable camelcase, no-console, no-nested-ternary, import/no-dynamic-require,
 import/newline-after-import, import/no-unresolved, global-require, max-len */
if (process.env.FUNCTION_NAME) {
  //  Load the Google Cloud Trace and Debug Agents before any require().
  //  Only works in Cloud Function.
  require('@google-cloud/trace-agent').start();
  require('@google-cloud/debug-agent').start();
}
const sigfoxgcloud = require('../index');
// const sigfoxgcloud = require('sigfoxgcloud');  //  Eventually

const firstLetter = 1;
const firstDigit = 27;

function decodeLetter(code) {
  //  Convert the 5-bit code to a letter.
  if (code === 0) return 0;
  if (code >= firstLetter && code < firstDigit) return (code - firstLetter) + 'a'.charCodeAt(0);
  if (code >= firstDigit) return (code - firstDigit) + '0'.charCodeAt(0);
  return 0;
}

/*
function identifyMessage(req, msg) {
  //  Return true if this is a structured message e.g. 920e5a00b051680194597b00.
  if (!msg || !msg.data) return false;
  const data = msg.data;
  //  TODO: Support 1 or 2 fields.
  if (data.substr(0, 2) !== '92') return false;
  if (data.length !== 24) return false;  //  12 bytes.
  return true;
}
*/

function decodeMessage(req, body) { /* eslint-disable no-bitwise, operator-assignment */
  //  Decode the packed binary SIGFOX message body data e.g. 920e5a00b051680194597b00
  //  2 bytes name, 2 bytes float * 10, 2 bytes name, 2 bytes float * 10, ...
  //  Returns a promise for the updated body.
  if (!body || !body.data) return Promise.resolve(body);
  // sigfoxgcloud.log(req, 'decodeMessage', { body });
  try {
    const data = body.data;
    const updatedBody = Object.assign({}, body);
    for (let i = 0; i < data.length; i = i + 8) {
      const name = data.substring(i, i + 4);
      const val = data.substring(i + 4, i + 8);
      let name2 =
        (parseInt(name[2], 16) << 12) +
        (parseInt(name[3], 16) << 8) +
        (parseInt(name[0], 16) << 4) +
        parseInt(name[1], 16);
      const val2 =
        (parseInt(val[2], 16) << 12) +
        (parseInt(val[3], 16) << 8) +
        (parseInt(val[0], 16) << 4) +
        parseInt(val[1], 16);

      //  Decode name.
      const name3 = [0, 0, 0];
      for (let j = 0; j < 3; j = j + 1) {
        const code = name2 & 31;
        const ch = decodeLetter(code);
        if (ch > 0) name3[2 - j] = ch;
        name2 = name2 >> 5;
      }
      const name4 = String.fromCharCode(name3[0], name3[1], name3[2]);
      updatedBody[name4] = val2 / 10.0;
    }
    const result = updatedBody;
    sigfoxgcloud.log(req, 'decodeMessage', { result, body });
    return Promise.resolve(result);
  } catch (error) {
    //  In case of error, return the original message.
    sigfoxgcloud.log(req, 'decodeMessage', { error, body });
    return Promise.resolve(body);
  }
}

function task(req, device, body, msg) {
  //  The task for this Google Cloud Function:
  //  Decode the structured body in the Sigfox message.
  //  This adds additional fields to the message body,
  //  e.g. ctr (counter), lig (light level), tmp (temperature).
  return decodeMessage(req, body)
    //  Return the message with the body updated.
    .then(updatedBody => Object.assign({}, msg, { body: updatedBody }));
}

//  When this Google Cloud Function is triggered, we call main() then task().
exports.main = event => sigfoxgcloud.main(event, task);

//  Unit Test
/* eslint-disable quotes, no-unused-vars */
const testEvent = {
  eventType: "providers/cloud.pubsub/eventTypes/topic.publish",
  resource: "projects/myproject/topics/sigfox.types.decodeStructuredMessage",
  timestamp: "2017-05-07T14:30:53.014Z",
  data: {
    attributes: {
    },
    type: "type.googleapis.com/google.pubsub.v1.PubsubMessage",
    data: "eyJkZXZpY2UiOiIxQzhBN0UiLCJ0eXBlIjoiZGVjb2RlU3RydWN0dXJlZE1lc3NhZ2UiLCJib2R5Ijp7InV1aWQiOiJhYjBkNDBiZC1kYmM1LTQwNzYtYjY4NC0zZjYxMGQ5NmU2MjEiLCJkYXRldGltZSI6IjIwMTctMDUtMDcgMTQ6MzA6NTEiLCJjYWxsYmFja1RpbWVzdGFtcCI6MTQ5NDE2NzQ1MTI0MCwiZGV2aWNlIjoiMUM4QTdFIiwiZGF0YSI6IjkyMGUwNjI3MjczMTc0MWRiMDUxZTYwMCIsImR1cGxpY2F0ZSI6ZmFsc2UsInNuciI6MTguODYsInN0YXRpb24iOiIwMDAwIiwiYXZnU25yIjoxNS41NCwibGF0IjoxLCJsbmciOjEwNCwicnNzaSI6LTEyMywic2VxTnVtYmVyIjoxNDkyLCJhY2siOmZhbHNlLCJsb25nUG9sbGluZyI6ZmFsc2UsInRpbWVzdGFtcCI6IjE0NzY5ODA0MjYwMDAiLCJiYXNlU3RhdGlvblRpbWUiOjE0NzY5ODA0MjYsInNlcU51bWJlckNoZWNrIjpudWxsfSwicXVlcnkiOnsidHlwZSI6ImFsdGl0dWRlIn0sImhpc3RvcnkiOlt7InRpbWVzdGFtcCI6MTQ5NDE2NzQ1MTI0MCwiZW5kIjoxNDk0MTY3NDUxMjQyLCJkdXJhdGlvbiI6MCwibGF0ZW5jeSI6bnVsbCwic291cmNlIjpudWxsLCJmdW5jdGlvbiI6InNpZ2ZveENhbGxiYWNrIn0seyJ0aW1lc3RhbXAiOjE0OTQxNjc0NTI0NTQsImVuZCI6MTQ5NDE2NzQ1MjgzMywiZHVyYXRpb24iOjAuMywibGF0ZW5jeSI6MS4yLCJzb3VyY2UiOiJwcm9qZWN0cy91bmF0dW1ibGVyL3RvcGljcy9zaWdmb3guZGV2aWNlcy5hbGwiLCJmdW5jdGlvbiI6InJvdXRlTWVzc2FnZSJ9XSwicm91dGUiOlsibG9nVG9Hb29nbGVTaGVldHMiXX0=",
  },
  eventId: "121025758478243",
};
const testBody = {
  data: "920e06272731741db051e600",
  longPolling: false,
  device: "1C8A7E",
  ack: false,
  station: "0000",
  avgSnr: 15.54,
  timestamp: "1476980426000",
  seqNumber: 1492,
  lat: 1,
  callbackTimestamp: 1494167451240,
  lng: 104,
  duplicate: false,
  datetime: "2017-05-07 14:30:51",
  baseStationTime: 1476980426,
  snr: 18.86,
  seqNumberCheck: null,
  rssi: -123,
  uuid: "ab0d40bd-dbc5-4076-b684-3f610d96e621",
};
if (!process.env.FUNCTION_NAME) exports.main(testEvent);
