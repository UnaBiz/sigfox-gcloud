//  Unit Test for decodeStructuredMessage
/* global describe:true, it:true, beforeEach:true */
/* eslint-disable import/no-extraneous-dependencies, no-console, no-unused-vars, one-var,
 no-underscore-dangle */
const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const should = chai.should();
chai.use(chaiAsPromised);

const common = require('../../index');
const moduleTested = require('../index');  //  Module to be tested, i.e. the parent module.
const structuredMessage = require('../structuredMessage');  //  Other modules to be tested.
const moduleName = 'decodeStructuredMessage';
let req = {};

//  Test data
/* eslint-disable quotes, max-len */
const testDevice = 'UNITTEST1';
const testData = {
  number: '920e06272731741db051e600',
  text: '8013e569a0138c15c013f929',
};
const testBody = (timestamp, data) => ({
  data,
  longPolling: false,
  device: testDevice,
  ack: false,
  station: "0000",
  avgSnr: 15.54,
  timestamp: `${timestamp}`,
  seqNumber: 1492,
  lat: 1,
  callbackTimestamp: timestamp,
  lng: 104,
  duplicate: false,
  datetime: "2017-05-07 14:30:51",
  baseStationTime: parseInt(timestamp / 1000, 10),
  snr: 18.86,
  seqNumberCheck: null,
  rssi: -123,
  uuid: "ab0d40bd-dbc5-4076-b684-3f610d96e621",
});
const testMessage = (timestamp, data) => ({
  history: [
    {
      duration: 0,
      end: timestamp,
      timestamp,
      function: "sigfoxCallback",
      latency: null,
    },
  ],
  query: {
    type: moduleName,
  },
  route: [],
  device: testDevice,
  body: testBody(timestamp, data),
  type: moduleName,
});
/*
const testEvent = {
  eventType: "providers/cloud.pubsub/eventTypes/topic.publish",
  resource: `projects/myproject/topics/sigfox.types.${moduleName}`,
  timestamp: "2017-05-07T14:30:53.014Z",
  data: {
    attributes: {
    },
    type: "type.googleapis.com/google.pubsub.v1.PubsubMessage",
    data: "eyJkZXZpY2UiOiIxQzhBN0UiLCJ0eXBlIjoiZGVjb2RlU3RydWN0dXJlZE1lc3NhZ2UiLCJib2R5Ijp7InV1aWQiOiJhYjBkNDBiZC1kYmM1LTQwNzYtYjY4NC0zZjYxMGQ5NmU2MjEiLCJkYXRldGltZSI6IjIwMTctMDUtMDcgMTQ6MzA6NTEiLCJjYWxsYmFja1RpbWVzdGFtcCI6MTQ5NDE2NzQ1MTI0MCwiZGV2aWNlIjoiMUM4QTdFIiwiZGF0YSI6IjkyMGUwNjI3MjczMTc0MWRiMDUxZTYwMCIsImR1cGxpY2F0ZSI6ZmFsc2UsInNuciI6MTguODYsInN0YXRpb24iOiIwMDAwIiwiYXZnU25yIjoxNS41NCwibGF0IjoxLCJsbmciOjEwNCwicnNzaSI6LTEyMywic2VxTnVtYmVyIjoxNDkyLCJhY2siOmZhbHNlLCJsb25nUG9sbGluZyI6ZmFsc2UsInRpbWVzdGFtcCI6IjE0NzY5ODA0MjYwMDAiLCJiYXNlU3RhdGlvblRpbWUiOjE0NzY5ODA0MjYsInNlcU51bWJlckNoZWNrIjpudWxsfSwicXVlcnkiOnsidHlwZSI6ImFsdGl0dWRlIn0sImhpc3RvcnkiOlt7InRpbWVzdGFtcCI6MTQ5NDE2NzQ1MTI0MCwiZW5kIjoxNDk0MTY3NDUxMjQyLCJkdXJhdGlvbiI6MCwibGF0ZW5jeSI6bnVsbCwic291cmNlIjpudWxsLCJmdW5jdGlvbiI6InNpZ2ZveENhbGxiYWNrIn0seyJ0aW1lc3RhbXAiOjE0OTQxNjc0NTI0NTQsImVuZCI6MTQ5NDE2NzQ1MjgzMywiZHVyYXRpb24iOjAuMywibGF0ZW5jeSI6MS4yLCJzb3VyY2UiOiJwcm9qZWN0cy91bmF0dW1ibGVyL3RvcGljcy9zaWdmb3guZGV2aWNlcy5hbGwiLCJmdW5jdGlvbiI6InJvdXRlTWVzc2FnZSJ9XSwicm91dGUiOlsibG9nVG9Hb29nbGVTaGVldHMiXX0=",
  },
  eventId: "121025758478243",
};
*/
/* eslint-enable quotes, max-len */

function startDebug() {
  //  Stub for setting breakpoints on exception.
  if (req.zzz) req.zzz += 1;  //  Will never happen.
}

function getTestMessage(type) {
  //  Return a copy of the test message with timestamp updated.
  const timestamp = Date.now();
  const msg = testMessage(timestamp, testData[type]);
  return msg;
}

describe('decodeStructuredMessage', () => {
  //  Test every exposed function in the module.

  beforeEach(() => {
    //  Erase the request object before every test.
    startDebug();
    req = { unittest: true };
  });

  it('should publish message', () => {
    //  Test whether we can publish a message to sigfox.devices.UNITTEST1.
    //  Note: Queue must exist.
    const msg = getTestMessage('number');
    const body = msg.body;
    common.log(req, 'unittest', { testDevice, body, msg });
    const promise = common.publishMessage(req, msg, testDevice, 'unittest')
      .then((result) => {
        common.log(req, 'unittest', { result });
        return result;
      })
      .catch((error) => {
        common.error(req, 'unittest', { error });
        debugger;
        throw error;
      })
    ;
    return Promise.all([
      promise,
    ]);
  });

  it('should decode structured message with numbers', () => {
    //  Test whether we can decode a structured message containing numbers.
    const msg = getTestMessage('number');
    const body = msg.body;
    common.log(req, 'unittest', { testDevice, body, msg });
    const promise = moduleTested.task(req, testDevice, body, msg)
      .then((result) => {
        common.log(req, 'unittest', { result });
        return result;
      })
      .catch((error) => {
        common.error(req, 'unittest', { error });
        debugger;
        throw error;
      })
    ;
    return Promise.all([
      promise,
      promise.should.eventually.have.deep.property('body.ctr').equals(999),
      promise.should.eventually.have.deep.property('body.lig').equals(754),
      promise.should.eventually.have.deep.property('body.tmp').equals(23),
    ]);
  });

  it('should decode structured message with text', () => {
    //  Test whether we can decode a structured message containing text.
    const data = testData.text;
    common.log(req, 'unittest', { data });
    const result = structuredMessage.decodeMessage(data, ['d1', 'd2', 'd3']);
    common.log(req, 'unittest', { result });
    result.should.have.property('d1').equals('zoe');
    result.should.have.property('d2').equals('ell');
    result.should.have.property('d3').equals('joy');
  });
});
