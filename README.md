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

<img src="https://storage.googleapis.com/unabiz-media/sigfox-gcloud/sigfox-gcloud-arch.svg" width="1024">

# Getting Started

Download this source folder to your computer.  For development
   we support Linux, MacOS and [Ubuntu on Windows 10](https://msdn.microsoft.com/en-us/commandline/wsl/about).

```bash
git clone https://github.com/UnaBiz/sigfox-gcloud.git
cd sigfox-gcloud
```

### Setting up Google Cloud

1. Create a Google Cloud Platform project. Assume the project ID is `myproject`.

    [*GO TO THE PROJECTS PAGE*](https://console.cloud.google.com/project?_ga=1.185886880.864313361.1477837820)
    
1. Create a file `.env` file in the `sigfox-gcloud` folder.  Edit the file
   and populate the `GCLOUD_PROJECT` variable with your project ID like this:

    ```bash
    GCLOUD_PROJECT=myproject
    ```

1. Enable billing for your project.

    [*ENABLE BILLING*](https://support.google.com/cloud/answer/6293499#enable-billing)

1. Enable the Cloud Functions and Cloud Pub/Sub APIs.

    [*ENABLE THE APIS*](https://console.cloud.google.com/flows/enableapi?apiid=cloudfunctions,pubsub&redirect=https://cloud.google.com/functions/docs/tutorials/pubsub&_ga=1.149082047.864313361.1477837820)

1. Install and initialize the Google Cloud SDK.

    [*GOOGLE CLOUD SDK*](https://cloud.google.com/sdk/docs/)

1. Update and install `gcloud` components:

    ```bash
    gcloud components update &&
    gcloud components install beta
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

1. Create a Google Cloud Storage bucket `myproject.appspot.com` to stage our Cloud Functions files during deployment:    
   
    ```javascript
    gsutil mb gs://myproject.appspot.com
    ```

1. Deploy all the included Cloud Functions with the script:

    ```bash
    scripts/deployall.sh  
    ```

1. Go to the *Google Cloud Functions Console*

    https://console.cloud.google.com/functions/list

    There should 4 Cloud Functions defined<br>
    Click the **`sigfoxCallback`** Cloud Function
    
    <img src="https://storage.googleapis.com/unabiz-media/sigfox-gcloud/pubsub-list.png" width="1024">

1.  Click the **`Trigger`** tab<br>
    Copy the **URL for `sigfoxCallback`**<br>
    The URL should look like:  
    `https://us-central1-myproject.cloudfunctions.net/sigfoxCallback`          
    
    This is the HTTPS URL that will invoke the `sigfoxCallback` Cloud Function.
    We shall set this as the **Sigfox callback URL** later.

    <img src="https://storage.googleapis.com/unabiz-media/sigfox-gcloud/pubsub-url.png" width="500">

### Setting the Sigfox callback

1.  As a Sigfox device maker you should have access to the *Sigfox Backend Portal*.
    We shall use the portal to configure the callback URL for
    your device.
    
    If you're not a Sigfox device maker yet, you may purchase the
    **UnaShield Sigfox Shield for Arduino** to get access to the
    Sigfox Backend.

    https://github.com/UnaBiz/unabiz-arduino/wiki/UnaShield

1. Log on to the **Sigfox Backend Portal**<br>
    Click **"Device Type"**<br>
    Select your Device Type<br>
    Click **"Callbacks"**<br>
    Click **"New"**

    <img src="https://storage.googleapis.com/unabiz-media/sigfox-gcloud/sigfox-callback-new.png" width="1024">

1.  Fill in the callback details as follows:

    <img src="https://storage.googleapis.com/unabiz-media/sigfox-gcloud/sigfox-callback.png" width="1024">

    **URL Pattern**: Enter the **Sigfox Callback URL**
   that we have copied earlier.  It should look like:   
   `https://us-central1-myproject.cloudfunctions.net/sigfoxCallback`          

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

### Defining the Sigfox message processing steps

1.  We define the Sigfox message processing steps as *routes* in the file

    [`routeMessage/routes.js`](https://github.com/UnaBiz/sigfox-gcloud/blob/master/routeMessage/routes.js)
 
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
    
    ▶️ [`sigfoxCallback` cloud function](https://github.com/UnaBiz/sigfox-gcloud/tree/master/sigfoxCallback)
      to ingest messages from Sigfox Cloud
          
    ▶️ `sigfox.devices.all` message queue
    
    ▶️ [`routeMessage` cloud function](https://github.com/UnaBiz/sigfox-gcloud/tree/master/routeMessage) to route the message
    
    ▶️ `sigfox.types.decodeStructuredMessage` message queue 

    ▶️ [`decodeStructuredMessage` cloud function](https://github.com/UnaBiz/sigfox-gcloud/tree/master/decodeStructuredMessage)
      to decode the structured sensor data in the message
    
    ▶️ `sigfox.types.logToGoogleSheets` message queue
    
    ▶️ [`logToGoogleSheets` cloud function](https://github.com/UnaBiz/sigfox-gcloud/tree/master/logToGoogleSheets) to write the decoded message to Google Sheets

    <img src="https://storage.googleapis.com/unabiz-media/sigfox-gcloud/sigfox-gcloud-arch.svg" width="1024">

1.  How it works:

    - Sigfox messages are pushed by the Sigfox Cloud to the Google Cloud Function
    [`sigfoxCallback`](https://github.com/UnaBiz/sigfox-gcloud/tree/master/sigfoxCallback)          
    
    - Cloud Function `sigfoxCallback` delivers the message to PubSub message queue
      `sigfox.devices.all`, as well as to the device ID and device type queues
    
    - Cloud Function 
      [`routeMessage`](https://github.com/UnaBiz/sigfox-gcloud/tree/master/routeMessage)
      listens to PubSub message queue 
      `sigfox.devices.all` and picks up the new message
    
    - Cloud Function `routeMessage` assigns a route to the 
      Sigfox message using a rule like this: 
      (see [`routeMessage/routes.js`](https://github.com/UnaBiz/sigfox-gcloud/blob/master/routeMessage/routes.js))

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
    
    - This rule routes the message to functions `decodeStructuredMessage` and `logToGoogleSheets`
      via the queues `sigfox.types.decodeStructuredMessage` and `sigfox.types.logToGoogleSheets`

1.  See this for the definition of structured messages:

    https://github.com/UnaBiz/unabiz-arduino/wiki/UnaShield

### Defining the Sigfox message processing steps

1.  Send some Sigfox messages from the Sigfox devices. Monitor the progress
    of the processing through the Google Cloud Logging Console.
    
1.  Processing errors will be reported to the Google Cloud Error Reporting
    Console.
    
1.  We may configure Google Cloud StackDriver Monitoring to create incident
    reports upon detecting any errors.  StackDriver may also be used to
    generate dashboards for monitoring the PubSub message processing queues.

#  Demo    
    
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
   the `data` field set to:

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

# Creating a Sigfox message processing module

1. Create a Google Cloud Function, using 
    [`decodeStructuredMessage`](https://github.com/UnaBiz/sigfox-gcloud/tree/master/decodeStructuredMessage) 
    as a template:

    ```bash
    mkdir myfunction
    cp decodeStructuredMessage/index.js myfunction
    cp decodeStructuredMessage/package.json myfunction
    cp decodeStructuredMessage/deploy.sh myfunction
    cd myfunction
    ```

1. Install `sigfox-gcloud` library:

    ```bash
    npm install --save sigfox-gcloud
    ```

1. Configure the Google PubSub message queue to be listened in 
    [`deploy.sh`](https://github.com/UnaBiz/sigfox-gcloud/blob/master/decodeStructuredMessage/deploy.sh#L3-L5)
    Any message delivered to this queue will trigger the
    message processing function.

      ```bash
      name=decodeStructuredMessage
      trigger=--trigger-topic
      topic=sigfox.types.${name}
      ```

1. Create the listen queue in 
    [*Google PubSub Console*](https://console.cloud.google.com/cloudpubsub/topicList), 
    e.g. `sigfox.types.decodeStructuredMessage`

1. Edit the message processing code in 
    [`index.js`](https://github.com/UnaBiz/sigfox-gcloud/blob/master/decodeStructuredMessage/index.js).  
    Every message processing function has 3 sections:
   
   - [**Common Declarations**](https://github.com/UnaBiz/sigfox-gcloud/blob/master/decodeStructuredMessage/index.js#L10-L24)
   
      ```javascript
      if (process.env.FUNCTION_NAME) {
        require('@google-cloud/trace-agent').start();
        require('@google-cloud/debug-agent').start();
      }
      const sigfoxgcloud = require('sigfox-gcloud');
      ```
   
     The standard declarations here initialise the
      `sigfox-gcloud` library, **Google Cloud Trace** 
      and **Google Cloud Debug** functions.  Retain this
      section without changes.
   
   - [**Message Processing Code**](https://github.com/UnaBiz/sigfox-gcloud/blob/master/decodeStructuredMessage/index.js#L26-L95)
   
      Replace this section with our JavaScript message processing code.
      We need to expose a function named `task()` that will perform the
      processing for a Sigfox message that has been delivered.
      
      ```javascript
      function task(req, device, body, msg)
      ```
      
      `req` contains info about the message that triggered the task
       
       `device` is the Sigfox device ID
       
       `body` is the body of the Sigfox message, which contains fields like:
        
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
            
       `msg` contains the complete message delivered by Google Cloud PubSub.
       This includes the `device`, `body`, `history` and `route` fields.
       
       `task()` should return a promise for the updated message after
       processing the message.
      
   - [**Main Function**](https://github.com/UnaBiz/sigfox-gcloud/blob/master/decodeStructuredMessage/index.js#L26-L95)

      ```javascript
      exports.main = event => sigfoxgcloud.main(event, task);
      ```
  
      The `main()` function that will be called upon receiving a message
      shall always be defined as above.  This calls the 
      [`main()`](https://github.com/UnaBiz/sigfox-gcloud/blob/master/index.js#L182-L213) 
      function in the `sigfox-gcloud` library which performs the following:
       
       - Decode the message received from Google Cloud PubSub (base64 format)

       - Execute the `task()` function above to process the message
       
       - Record the history of `task()` functions called
       
       - Dispatch the resulting message to the next step (if any) of the
          message route contained in the message.   The message route
          was set previously by the `routeMessage` cloud function.

1. Deploy the module
 
    ```bash
    ./deploy.sh
    ```

1. Update the Sigfox message processing routes in 
    [`routeMessage/routes.js`](https://github.com/UnaBiz/sigfox-gcloud/blob/master/routeMessage/routes.js)

1. Send a Sigfox message to test

