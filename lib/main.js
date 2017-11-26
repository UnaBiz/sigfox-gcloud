//  Helper for main function
/* eslint-disable camelcase */
const isGoogleCloud = !!process.env.FUNCTION_NAME || !!process.env.GAE_SERVICE;

function getMainFunction(wrapper, wrap, package_json) {
  //  For Google Cloud, select the 2-para or 1-para version of main()
  //  depending on the call mode: HTTP or PubSub Queue.
  if (!isGoogleCloud) throw new Error('getMainFunction is for Google Cloud only');
  if (!wrapper || !wrap) throw new Error('Missing wrapper or wrap function');
  if (!wrapper.main) Object.assign(wrapper, wrap(package_json));
  const mainFunc = wrapper.main.bind(wrapper);
  if (process.env.FUNCTION_TRIGGER_TYPE === 'HTTP_TRIGGER') {
    //  Return the 2-para main function for HTTP mode.
    return (req0, res0) => mainFunc(req0, res0);
  }
  //  Else return the 1-para main function for PubSub mode.
  return event0 => mainFunc(event0);
}

module.exports = {
  getMainFunction,
};
