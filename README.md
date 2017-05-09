**sigfox-gcloud** is a software framework for building a
Sigfox server with Google Cloud Functions and Google Cloud PubSub message queues:

- **Modular**: Process Sigfox messages in modular steps using 
  simple Node.js (JavaScript) functions.
  
- **Extensible**: Allows new Sigfox message processing modules to be added on the
  fly without disrupting or restarting all modules.  
  
- **Robust**: The processing modules are implemented
  as separate Google Cloud Functions, so one module
  crashing will not affect others. Google Cloud PubSub message
  queues are used to pass the Sigfox messages reliably between processing modules.

<img src="https://github.com/UnaBiz/media/blob/master/sigfox-gcloud/sigfox-gcloud-arch.png" width="1024">

## Getting Started

1. Download this source folder to your computer.  For development
   we support Linux, MacOS and Ubuntu on Windows 10.

    ```bash
    git clone https://github.com/UnaBiz/sigfox-gcloud.git
    cd sigfox-gcloud
    ```

1. Create a Google Cloud Project. Assume the project ID is `myproject`

1. Create a file `.env` file in the `sigfox-gcloud` folder.  Edit the file
   and populate the `GCLOUD_PROJECT` variable with your project ID like this:

    ```bash
    GCLOUD_PROJECT=myproject
    ```

1. Create a Google Cloud Service Account and download the JSON credentials
  into `google-credentials.json` in the `sigfox-gcloud` folder.
  
1. Ensure the Google Cloud Service Account in `google-credentials.json`
   has been granted `Editor` rights to the Google Cloud Project `myproject`

1. Create the Google PubSub message queues that we will use to route the
   Sigfox messages between the Cloud Functions:
   
    - `sigfox.devices.all`: The queue that will receive Sigfox messages for all devices
    
    - `sigfox.devices.<deviceID>`: The queue that will receive Sigfox messages for a specific device 
      e.g. `sigfox.devices.1A234`
      
    - `sigfox.types.<deviceType>`: The queue that will receive Sigfox messages for a specific device type 
      or a message processing step e.g. `sigfox.types.gps`
      
   Also create these queues that will be used for the Sigfox message processing demo: 

    ```
    sigfox.types.decodeStructuredMessage
    sigfox.types.logToGoogleSheets
    ```

1. Create a Google Cloud Storage bucket for deployment:

    `<projectid>.appspot.com`

    e.g. `myproject.appspot.com`

1. Install Google Cloud SDK and the command line interface.  
    Deploy all the included Cloud Functions with the script

    ```bash
    scripts/deployall.sh  
    ```

1. Configure the Sigfox backend to use the `sigfoxCallback`
   Google Cloud Function as the HTTPS callback for our Sigfox devices.
   The URL may be obtained from the Google Cloud Functions Console.  The URL looks like:
   
       https://us-central1-myproject.cloudfunctions.net/sigfoxCallback

1. Set the Sigfox message payload as:

    ```json
    {                             
     "device" : "{device}",        
     "data" : "{data}",            
     "time" : "{time}",            
     "duplicate": "{duplicate}",   
     "snr": "{snr}",               
     "station": "{station}",       
     "avgSnr": "{avgSnr}",         
     "lat": "{lat}",               
     "lng": "{lng}",               
     "rssi": "{rssi}",             
     "seqNumber": "{seqNumber}",   
     "ack": "{ack}",               
     "longPolling": "{longPolling}"
    }                             
    ```

1.  Set the `Content-Type` header to `application/json` 

1.  We may set the callback type in the `sigfoxCallback` URL by
    passing the `type` parameter in the URL like this:

    ```
    https://us-central1-myproject.cloudfunctions.net/sigfoxCallback?type=gps
    ```

    It's OK to omit the `type` parameter, we may also use routing rules
    to define the processing steps.

1.  We define the Sigfox message processing steps as *routes* in the file

    ```
    routeMessage/routes.js
    ```
 
    Each route looks like
    ```
    [ decodeStructuredMessage, logToGoogleSheets, ... ]
    ```
    in which `decodeStructuredMessage` and `logToGoogleSheets` are the Google Cloud Functions to be called sequentially.
    These Cloud Functions will subscribe to the following Google PubSub queues to listen for Sigfox messages:
    
    ```
    sigfox.types.decodeStructuredMessage
    sigfox.types.logToGoogleSheets
    ```

1.  Here is an example of a route for Sigfox message processing, as shown in the demo.

    Sigfox Cloud
    
    --> `sigfoxCallback` function
    
    --> `sigfox.devices.all` queue
    
    --> `routeMessage` function to route the message
    
    --> `sigfox.types.decodeStructuredMessage` queue 

    --> `decodeStructuredMessage` function to decode the message
    
    --> `sigfox.types.logToGoogleSheets` queue
    
    --> `logToGoogleSheets` function to write the message to Google Sheets

    <img src="https://github.com/UnaBiz/media/blob/master/sigfox-gcloud/sigfox-gcloud-arch.png" width="1024">

1.  How it works:

    - Sigfox messages are pushed by the Sigfox Cloud to the Google Cloud Function
    `sigfoxCallback`
    
    - The Sigfox messages are delivered to the Cloud Function
    `routeMessage` via PubSub message queue `sigfox.devices.all`
    
    - Cloud Function `routeMessage` will assign a route to the 
      Sigfox message using a rule like this:

    ```javascript
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
    ```
    
    - This will route the message to functions `decodeStructuredMessage` and `logToGoogleSheets`
      via the queues `sigfox.types.decodeStructuredMessage` and `sigfox.types.logToGoogleSheets`

1.  See this for the definition of structured messages:

    https://github.com/UnaBiz/unabiz-arduino/wiki/UnaShield

1.  Send some Sigfox messages from the Sigfox devices. Monitor the progress
    of the processing through the Google Cloud Logging Console.
    
1.  Processing errors will be reported to the Google Cloud Error Reporting
    Console.
    
1.  We may configure Google Cloud StackDriver Monitoring to create incident
    reports upon detecting any errors.  StackDriver may also be used to
    generate dashboards for monitoring the PubSub message processing queues.

##  Demo    
    
1. The sample code calls the `decodeStructuredMessage` Cloud Function to decode a structured
   Sigfox message containing encoded sensor data (counter, light level, temperature). 
    Then it calls the `logToGoogleSheets` Cloud Function to display the decoded
   Sigfox messages in a Google Sheets spreadsheet in real time.
   
    See this for the definition of structured messages:
   
       https://github.com/UnaBiz/unabiz-arduino/wiki/UnaShield
   
1. Ensure that the Google Service Account in `google-credentials.json`
 has been granted these permission scopes for Sheets API, Drive API:
                  
    ```
    https://www.googleapis.com/auth/spreadsheets
    https://www.googleapis.com/auth/drive
    ```

1. Create a folder in Google Drive and grant write access to the email
  address specified in `google-credentials.json`.

1. In that folder, create a Google Sheets spreadsheet with the device ID (in uppercase)
  as the filename, e.g. `1A2345`.  Omit any file extensions like `.xls`

1. In the spreadsheet, rename the first tab / worksheet as `Log`.

1. Populate the first row with these column headers, one name per column:
    ```
    timestamp+8
    data
    ctr
    lig
    tmp
    seqNumberCheck
    rssi
    duplicate
    snr
    station
    avgSnr
    lat
    lng
    ack
    longPolling
    time
    seqNumber
    type
    device
    ```

1. Change `timestamp+8` to indicate your time zone, e.g. for UTC+10 change it to `timestamp+10`

1. Refer to the sample Google Sheet here:

    `https://docs.google.com/spreadsheets/d/1OtlfVx6kibMxnZoSwq76Vod8HhaK5tzBIBAewtZlbXM/edit?usp=sharing`

1. To test the structured message decoding, send a Sigfox message with
   the `data` field set ti:

    ```
    920e82002731b01db0512201
    ```
   
   We may also use a URL testing tool like Postman to send a POST request to the `sigfoxCallback` URL e.g.
      
   `https://us-central1-myproject.cloudfunctions.net/sigfoxCallback`

   Set the `Content-Type` header to `application/json`. Set the body to:
   
    ```json
    {
      "device":"1A2345",
      "data":"920e82002731b01db0512201",
      "time":"1476980426",
      "duplicate":"false",
      "snr":"18.86",
      "station":"0000",
      "avgSnr":"15.54",
      "lat":"1",
      "lng":"104",
      "rssi":"-123.00",
      "seqNumber":"1492",
      "ack":"false",
      "longPolling":"false"
    }
    ```
   
    where `device` is your device ID.
   
1. This will be decoded and displayed in the Google Sheet as 

    ```
    ctr (counter): 13
    lig (light level): 760
    tmp (temperature): 29        
    ```

## Creating a Sigfox message processing module

1. Create a Google Cloud Function, using `decodeStructuredMessage` as a template:

    ```bash
    mkdir myfunction
    cp decodeStructuredMessage/index.js myfunction
    cp decodeStructuredMessage/package.json myfunction
    cp decodeStructuredMessage/deploy.sh myfunction
    cd myfunction
    ```

1. Install `sigfox-gcloud`

    ```bash
    npm install --save sigfox-gcloud
    ```

1. Configure the Google PubSub message queue to be listened in `deploy.sh`

1. Create the queues in Google PubSub Console

1. Deploy the module
 
    ```bash
    ./deploy.sh
    ```

1. Update the Sigfox message processing routes in `routeMessage/routes.js`

1. Send a Sigfox message to test

