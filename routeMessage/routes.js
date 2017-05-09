//  This file states how the Sigfox messages for each device ID
//  should be routed.  Each Sigfox message usually requires a
//  few steps of processing, so we list out the steps here.
//  Each step corresponds to a Google Cloud Function.

//  This routes are hardcoded here so it can never fail
//  e.g. due to database failure.

//  Predefined Cloud Functions for processing Sigfox messages.
const decodeStructuredMessage = 'decodeStructuredMessage';
const logToGoogleSheets = 'logToGoogleSheets';

//  Each element of this array maps device IDs to route
//  [ msgType1, msgType2, .... ]
module.exports = [
  { //  This is the first device IDs -> route.
    devices:
    [ //  UnaShield training device IDs for Temasek Polytechnic.
      'UTDEMO1',
      '1C88B1',
      '1C8A52',
      '1C8A50',
      '1C8895',
      '1C8891',
      '1C88EC',
      '1C8A31',
      '1C8A65',
      '1C8A7E',
    ],
    route:
    [ //  Route the Sigfox messages for the above device IDs like this:
      //  Decode the structured sensor data message...
      decodeStructuredMessage,
      //  Then log the decoded Sigfox message to Google Sheets.
      logToGoogleSheets,
      //  This enables the Temasek Polytechnic students to see the
      //  sensor data for their UnaShield dev kits properly decoded
      //  and displayed in a Google Sheets.
    ],
  },
  //  Add your device IDs -> route here.
];

//  See this for the definition of structured messages:
//  https://github.com/UnaBiz/unabiz-arduino/wiki/UnaShield
