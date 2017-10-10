//  Unit Test for decodeStructuredMessage
/* global describe:true, it:true, beforeEach:true */
/* eslint-disable max-len, import/newline-after-import,import/no-extraneous-dependencies,no-unused-vars,no-debugger */
const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const should = chai.should();
chai.use(chaiAsPromised);

const common = require('../../index');
const moduleTested = require('../index');  //  Module to be tested, i.e. the parent module.
const structuredMessage = require('../structuredMessage');  //  Other modules to be tested.
const moduleName = 'decodeStructuredMessage';
let req = {};
let testRootSpanPromise = null;

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

function startDebug() {
  //  Stub for setting breakpoints on exception.
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
    if (testRootSpanPromise) req.rootSpanPromise = testRootSpanPromise;
  });

  it('should create root span', () => {
    //  Test whether we can create a root span.
    const msg = getTestMessage('number');
    const body = msg.body;
    req.body = body;
    common.log(req, 'unittest', { testDevice, body, msg });
    const result = common.startRootSpan(req);
    if (!result) throw new Error('rootSpan missing');
    testRootSpanPromise = req.rootSpanPromise;
    if (!testRootSpanPromise) throw new Error('rootSpanPromise missing');
  });

  it('should publish message', () => {
    //  Test whether we can publish a message to sigfox.devices.UNITTEST1.
    //  Note: Queue must exist.
    const msg = getTestMessage('number');
    const body = msg.body;
    req.body = body;
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
    req.body = body;
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

  it('should end root span', () => {
    //  Test whether we can end a root span.
    const msg = getTestMessage('number');
    const body = msg.body;
    req.body = body;
    common.log(req, 'unittest', { testDevice, body, msg });
    const promise = common.endRootSpan(req)
      .then((result) => {
        common.log(req, 'unittest', { result });
        if (!req.rootSpanPromise) testRootSpanPromise = null;
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
});
