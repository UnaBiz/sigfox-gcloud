//  AWS-specific definitions for sigfox-aws
/* eslint-disable max-len,import/no-unresolved */

const isProduction = (process.env.NODE_ENV === 'production');  //  True on production server.
const functionName = process.env.AWS_LAMBDA_FUNCTION_NAME || 'unknown_function';
const logName = process.env.LOGNAME || 'sigfox-aws';

const stringify = require('json-stringify-safe');

//  //////////////////////////////////////////////////////////////////////////////////// endregion
//  region Utility Functions

//  //////////////////////////////////////////////////////////////////////////////////// endregion
//  region Instrumentation Functions: Trace the execution of this Sigfox Callback across multiple Cloud Functions via AWS X-Ray

//  Allow AWS X-Ray to capture trace.
//  eslint-disable-next-line import/no-unresolved
const AWSXRay = require('aws-xray-sdk-core');
AWSXRay.middleware.setSamplingRules({
  rules: [{ description: 'sigfox-aws', service_name: '*', http_method: '*', url_path: '/*', fixed_target: 0, rate: 0.5 }],
  default: { fixed_target: 1, rate: 0.5 },
  version: 1,
});

//  Create the AWS SDK instance.
const AWS = isProduction
  ? AWSXRay.captureAWS(require('aws-sdk'))
  : require('aws-sdk');
if (isProduction) AWS.config.update({ region: process.env.AWS_REGION });
else AWS.config.loadFromPath('./aws-credentials.json');

//  TODO
const rootSpanStub = {
  startSpan: (/* rootSpanName, labels */) => ({
    end: () => ({}),
  }),
  end: () => ({}),
};
const rootTraceStub = {  // new tracingtrace(tracing, rootTraceId);
  startSpan: (/* rootSpanName, labels */) => rootSpanStub,
  end: () => ({}),
};

const tracing = { startTrace: () => rootTraceStub };

function createRootTrace(/* req, rootTraceId */) {
  //  Return the root trace for instrumentation.
  return rootTraceStub;
}

function startTrace(/* req */) {
  //  Start the trace.
  return tracing.startTrace();
}

//  //////////////////////////////////////////////////////////////////////////////////// endregion
//  region Logging Functions: Log to AWS CloudWatch

//  TODO
const loggingLog = {
  write: (entry) => { console.log(stringify(entry ? entry.event || '' : '', null, 2)); return Promise.resolve({}); },
  entry: (metadata, event) => ({ metadata, event }),
};

function reportError(/* req. err, action, para */) {
  //  TODO: Report error to CloudWatch.
}

//  //////////////////////////////////////////////////////////////////////////////////// endregion
//  region Messaging Functions: Dispatch messages between Cloud Functions via AWS IoT MQTT Queues

const Iot = new AWS.Iot();
let awsIoTDataPromise = null;

function sendIoTMessage(req, topic0, payload) {
  //  Send the text message to the AWS IoT MQTT queue name.
  //  In Google Cloud topics are named like sigfox.devices.all.  We need to rename them
  //  to AWS MQTT format like sigfox/devices/all.
  const payloadObj = JSON.parse(payload);
  const topic = (topic0 || '').split('.').join('/');
  const params = { topic, payload, qos: 0 };
  module.exports.log(req, 'sendIoTMessage', { topic, payloadObj, params });
  return getIoTData(req)
    .then(IotData => IotData.publish(params).promise())
    .then(result => module.exports.log(req, 'sendIoTMessage', { result, topic, payloadObj, params }))
    .catch((error) => { module.exports.error(req, 'sendIoTMessage', { error, topic, payloadObj, params }); throw error; });
}

/* function sendSQSMessage(req, topic0, msg) {
  //  Send the text message to the AWS Simple Queue Service queue name.
  //  In Google Cloud topics are named like sigfox.devices.all.  We need to rename them
  //  to AWS SQS format like sigfox-devices-all.
  const msgObj = JSON.parse(msg);
  const topic = (topic0 || '').split('.').join('-');
  const url = `${SQS.endpoint.href}${topic}`;
  const params = {
    MessageBody: msg,
    QueueUrl: url,
    DelaySeconds: 0,
    MessageAttributes: {
      device: {
        DataType: 'String',
        StringValue: msgObj.device || 'missing_device',
      },
    },
  };
  module.exports.log(req, 'awsSendSQSMessage', { topic, url, msgObj, params });
  return SQS.sendMessage(params).promise()
    .then(result => module.exports.log(req, 'awsSendSQSMessage', { result, topic, url, msgObj, params }))
    .catch((error) => { module.exports.error(req, 'awsSendSQSMessage', { error, topic, url, msgObj, params }); throw error; });
} */

function getQueue(req, projectId0, topicName) {
  //  Return the AWS IoT MQTT Queue and AWS Simple Queue Service queue with that name
  //  for that project.  Will be used for publishing messages, not reading.
  const topic = {
    topic: topicName,
    publisher: () => ({
      publish: (buffer) => {
        let subsegment = null;
        return new Promise((resolve) => {
          //  Publish the message body as an AWS X-Ray annotation.
          //  This allows us to trace the message processing through AWS X-Ray.
          AWSXRay.captureAsyncFunc(topicName, (subsegment0) => {
            subsegment = subsegment0;
            try {
              const msg = JSON.parse(buffer.toString());
              const body = msg.body || msg;
              if (!body) {
                console.log('awsGetTopic', 'no_body');
                return resolve('no_body');
              }
              for (const key of Object.keys(body)) {
                //  Log only scalar values.
                const val = body[key];
                if (val === null || val === undefined) continue;
                if (typeof val === 'object') continue;
                subsegment.addAnnotation(key, val);
              }
            } catch (error) {
              console.error('awsGetTopic', error.message, error.stack);
            }
            return resolve('OK');
          });
        })
          .then(() => sendIoTMessage(req, topicName, buffer.toString()).catch(module.exports.dumpError))
          // TODO: sendSQSMessage(req, topicName, buffer.toString()).catch(module.exports.dumpError),
          .then((res) => {
            if (subsegment) subsegment.close();
            return res;
          })
          .catch(error => error);
      },
    }),
  };
  return topic;
}

//  //////////////////////////////////////////////////////////////////////////////////// endregion
//  region Device State Functions: Memorise the device state with AWS IoT Thing Shadows

function getIoTData(/* req */) {
  //  Return a promise for the IotData object for updating message queue
  //  and device state.
  if (awsIoTDataPromise) return awsIoTDataPromise;
  awsIoTDataPromise = Iot.describeEndpoint({}).promise()
    .then((res) => {
      const IotData = new AWS.IotData({ endpoint: res.endpointAddress });
      return IotData;
    })
    .catch((error) => {
      awsIoTDataPromise = null;
      throw error;
    });
  return awsIoTDataPromise;
}

function createDevice(req, device0) {
  //  Create the AWS Thing with the device name if it doesn't exist.  device is the
  //  Sigfox device ID.
  if (!device0) throw new Error('missing_deviceid');
  //  Capitalise device ID but not device names.
  const device = device0.length > 6 ? device0 : device0.toUpperCase();
  const params = { thingName: device };
  console.log({ describeThing: params });
  //  Lookup the device.
  return Iot.describeThing(params).promise()
  //  Device exists.
    .then(result => module.exports.log(req, 'awsCreateDevice', { result, device, params }))
    //  Device is missing. Create it.
    .catch(() => console.log({ createThing: params }) || Promise.resolve(null)
      .then(() => Iot.createThing(params).promise())
      .then(result => module.exports.log(req, 'awsCreateDevice', { result, device, params }))
      .catch((error) => { module.exports.error(req, 'awsCreateDevice', { error, device, params }); throw error; })
    );
}

function getDeviceState(req, device0) {
  //  Fetch the AWS IoT Thing state for the device ID.  Returns a promise.
  //  Result looks like {"reported":{"deviceLat":1.303224739957452,...
  if (!device0) throw new Error('missing_deviceid');
  //  Capitalise device ID but not device names.
  const device = device0.length > 6 ? device0 : device0.toUpperCase();
  const params = { thingName: device };
  console.log({ getThingShadow: params });
  //  Get a connection for AWS IoT Data.
  return getIoTData(req)
  //  Fetch the Thing state.
    .then(IotData => IotData.getThingShadow(params).promise())
    //  Return the payload.state.
    .then(res => (res && res.payload) ? JSON.parse(res.payload) : res)
    .then(res => (res && res.state) ? res.state : res)
    .then(result => module.exports.log(req, 'awsGetDeviceState', { result, device, params }))
    .catch((error) => { module.exports.error(req, 'awsGetDeviceState', { error, device, params }); throw error; });
}

// eslint-disable-next-line no-unused-vars
function updateDeviceState(req, device0, state) {
  //  Update the AWS IoT Thing state for the device ID.  Returns a promise.
  //  Overwrites the existing Thing attributes with the same name.
  if (!device0) throw new Error('missing_deviceid');
  //  Capitalise device ID but not device names.
  const device = device0.length > 6 ? device0 : device0.toUpperCase();
  const payload = {
    state: {
      reported: state,
    },
  };
  const params = {
    payload: JSON.stringify(payload),
    thingName: device,
  };
  console.log({ updateThingShadow: params });
  //  Get a connection for AWS IoT Data.
  return getIoTData(req)
  //  Update the Thing state.
    .then(IotData => IotData.updateThingShadow(params).promise())
    .then(result => module.exports.log(req, 'awsUpdateDeviceState', { result, device, state, payload, params }))
    .catch((error) => { module.exports.error(req, 'awsUpdateDeviceState', { error, device, state, payload, params }); throw error; });
}

//  //////////////////////////////////////////////////////////////////////////////////// endregion
//  region Module Exports

module.exports = {
  projectId: null,
  functionName,
  logName,
  sourceName: process.env.AWS_LAMBDA_FUNCTION_NAME || logName,
  credentials: null,  //  No credentials needed.

  //  Logging
  loggingLog,
  reportError,

  //  Instrumentation
  startTrace,
  createRootTrace,

  //  Messaging
  getQueue,

  //  Device State
  createDevice,
  getDeviceState,
  updateDeviceState,
};
