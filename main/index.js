//  Helper for main function
/*  eslint-disable max-len,camelcase,import/no-extraneous-dependencies,import/no-unresolved,global-require,import/newline-after-import */

process.on('uncaughtException', err => console.error('uncaughtException', err.message, err.stack));  //  Display uncaught exceptions.
process.on('unhandledRejection', (reason, p) => console.error('unhandledRejection', reason, p));  //  Display uncaught promises.

//  Read .env file to set any environment variables.
const dotenv = require('dotenv');
dotenv.load();

const isGoogleCloud = !!process.env.FUNCTION_NAME || !!process.env.GAE_SERVICE;
if (isGoogleCloud) {  //  Start agents for Google Cloud.
  // eslint-disable-next-line import/no-extraneous-dependencies
  if (!process.env.DISABLE_DNSCACHE) require('dnscache')({ enable: true });  //  Enable DNS cache in case we hit the DNS quota for Google Cloud Functions.
  if (!process.env.DISABLE_TRACE) require('@google-cloud/trace-agent').start();  //  Must enable Google Cloud Tracing before other require()
  if (!process.env.DISABLE_DEBUG) require('@google-cloud/debug-agent').start();  //  Must enable Google Cloud Debug before other require()
}
const scloud = isGoogleCloud ? require('sigfox-gcloud') : null;

function getMainFunction(wrapper, wrap, package_json) {
  //  Return the Google Cloud startup function main(), if defined in the wrap() function.
  //  If the wrap() function defines task(), return the main() function
  //  from sigfox-iot-cloud, after passing task() to main().
  //  For Google Cloud, select the 2-para or 1-para version of main()
  //  depending on the call mode: HTTP or PubSub Queue.
  if (!isGoogleCloud) throw new Error('getMainFunction is for Google Cloud only');
  if (!wrapper || !wrap) throw new Error('Missing wrapper or wrap function');
  if (!wrapper.main && !wrapper.task) Object.assign(wrapper, wrap(scloud, package_json));
  const mainFunc = wrapper.main ? wrapper.main.bind(wrapper) : scloud.main.bind(wrapper);
  const taskFunc = wrapper.task ? wrapper.task.bind(wrapper) : null;
  if (process.env.FUNCTION_TRIGGER_TYPE === 'HTTP_TRIGGER') {
    //  Return the 2-para main function for HTTP mode.
    return (req0, res0) => mainFunc(req0, res0, taskFunc);
  }
  //  Else return the 1-para main function for PubSub mode.
  return event0 => mainFunc(event0, taskFunc);
}

module.exports = {
  getMainFunction,
};
