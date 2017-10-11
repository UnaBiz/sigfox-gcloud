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

Other `sigfox-cloud` modules available:

1. [`sigfox-gcloud-ubidots`:](https://www.npmjs.com/package/sigfox-gcloud-ubidots)
    Adapter for integrating Sigfox devices with the easy and friendly **Ubidots IoT platform**


[<kbd><img src="https://storage.googleapis.com/unabiz-media/sigfox-gcloud/sigfox-gcloud-arch.svg" width="1024"></kbd>](https://storage.googleapis.com/unabiz-media/sigfox-gcloud/sigfox-gcloud-arch.svg)

# Releases

- **Version 1.0.0** (11 Oct 2017): Supports **Google Cloud Trace** for tracing the Sigfox Callback processing time
  across Cloud Functions.  Supports **Google Cloud Debug** for capturing Node.js memory snapshots.
  Supports **Ubidots map visualisation** of Sigfox Geolocation and other geolocated sensor data points.

# Getting Started

Download the `sigfox-cloud` source folder to your computer.  For development
   we support Linux, MacOS and [Ubuntu on Windows 10](https://msdn.microsoft.com/en-us/commandline/wsl/about).

```bash
git clone https://github.com/UnaBiz/sigfox-gcloud.git
cd sigfox-gcloud
```

If you're using Ubuntu on Windows 10, we recommend that you launch "Bash on Ubuntu on Windows" and enter the following
commands to download the source files into the folder `/mnt/c/sigfox-gcloud`:

```bash
cd /mnt/c
git clone https://github.com/UnaBiz/sigfox-gcloud.git
cd sigfox-gcloud
```

That's because `/mnt/c/sigfox-gcloud` under `bash` is a shortcut to `c:\sigfox-gcloud` under Windows.  
So you could use Windows Explorer and other Windows tools to browse and edit files in the folder.
Remember to use a text editor like Visual Studio Code that can save files using 
the Linux line-ending convention (linefeed only: `\n`), 
instead of the Windows convention (carriage return + linefeed: `\r \n`).

### Setting up Google Cloud

1. Create a Google Cloud Platform project. Assume the project ID is `myproject`.

    [*GO TO THE PROJECTS PAGE*](https://console.cloud.google.com/project)
    
1. Open a bash command prompt.  For Windows, open "Bash on Ubuntu on Windows."  
    Create a file named `.env` in the `sigfox-gcloud` folder  
    and populate the `GCLOUD_PROJECT` variable with your project ID.
     To do that, you may use this command 
    (change `myproject` to your project ID):

    ```bash
    echo GCLOUD_PROJECT=myproject >.env
    ```

1. Enable billing for your project.

    [*ENABLE BILLING*](https://support.google.com/cloud/answer/6293499#enable-billing)

1. Click this special link to enable the Cloud Functions, Cloud Pub/Sub, Compute Engine, Stackdriver Logging APIs for your project.

    [*ENABLE THE APIS*](https://console.cloud.google.com/flows/enableapi?apiid=cloudfunctions,pubsub,logging,compute_component)

1. For Linux and MacOS, click this link to install and initialize the Google Cloud SDK.

    [*GOOGLE CLOUD SDK*](https://cloud.google.com/sdk/docs/)

    For Ubuntu on Windows 10, open "Bash on Ubuntu on Windows" and follow the Ubuntu installation steps here:
  
    https://cloud.google.com/sdk/downloads#apt-get

1. Update and install `gcloud` components:

    ```bash
    gcloud components update
    gcloud components install beta
    ```

1. Switch to the project you have created: (change `myproject` to your project ID)

    ```bash
    gcloud config set project myproject
    gcloud config list project
    ```
    
    Your project ID should be displayed after `list project`.

1.  Add the following `sigfox-route` setting to the Google Cloud Project Metadata store.
    This route says that all received Sigfox messages will be processed by the
    two steps `decodeStructuredMessage` and `logToGoogleSheets`.

    ```bash
    gcloud compute project-info add-metadata --metadata=^:^sigfox-route=decodeStructuredMessage,logToGoogleSheets
    ```

1. Create the Google PubSub message queues that we will use to route the
   Sigfox messages between the Cloud Functions:
   
    ```bash
    gcloud beta pubsub topics create sigfox.devices.all
    gcloud beta pubsub topics create sigfox.types.decodeStructuredMessage
    gcloud beta pubsub topics create sigfox.types.logToGoogleSheets
    ```
    
   **Optional:** We may create the PubSub message queues
   for each device ID and device type that we wish to support.  For example, to
   support device ID `1A234` and device type `gps`, we would execute:

    ```bash
    # Optional...
    gcloud beta pubsub topics create sigfox.devices.1A234
    gcloud beta pubsub topics create sigfox.types.gps
    ```
    
    The PubSub queues will be used as follows:
    - `sigfox.devices.all`: The queue that will receive Sigfox messages for all devices
    
    - `sigfox.devices.<deviceID>`: The queue that will receive Sigfox messages for a specific device 
      e.g. `sigfox.devices.1A234`.  Device ID must be in uppercase.
      
    - `sigfox.types.<deviceType>`: The queue that will receive Sigfox messages for a specific device type 
      or a message processing step e.g. `sigfox.types.gps`

    - `sigfox.types.decodeStructuredMessage`, `sigfox.types.logToGoogleSheets`:
      used for sending messages to be decoded and logged in the Sigfox 
      message processing demo below

1.  If you plan to run the Google Sheets demo below:

    -   Go to the
        [Google Cloud IAM](https://console.cloud.google.com/iam-admin/serviceaccounts/project)
        to create a Google Cloud Service Account.
        Download the JSON credentials 
        into `google-credentials.json` in the `sigfox-gcloud` folder.

    -   Go to the 
        [Google Cloud IAM](https://console.cloud.google.com/iam-admin/iam/project)
        and ensure the Google Cloud Service Account in `google-credentials.json`
        has been granted `Editor` rights to your Google Cloud Project

1. Create a Google Cloud Storage bucket `gs://<projectid>-sigfox-gcloud` to stage our Cloud Functions files 
    during deployment, like this: (change `myproject` to your project ID)
   
    ```bash
    gsutil mb gs://myproject-sigfox-gcloud
    ```

1. Deploy all the included Cloud Functions (including the demo functions) with the `deployall.sh` script:

    ```bash
    chmod +x */*.sh
    scripts/deployall.sh
    ```

1. Go to the **[Google Cloud Functions Console](https://console.cloud.google.com/functions/list)**
    
    There should 4 Cloud Functions defined<br>
    Click the **`sigfoxCallback`** Cloud Function
    
    [<kbd><img src="https://storage.googleapis.com/unabiz-media/sigfox-gcloud/pubsub-list.png" width="1024"></kbd>](https://storage.googleapis.com/unabiz-media/sigfox-gcloud/pubsub-list.png)   

1.  Click the **`Trigger`** tab<br>
    Copy the **URL for `sigfoxCallback`**<br>
    The URL should look like:  
    `https://us-central1-myproject.cloudfunctions.net/sigfoxCallback`          
    
    This is the HTTPS URL that will invoke the `sigfoxCallback` Cloud Function.
    We shall set this as the **Sigfox callback URL** later.

    [<kbd><img src="https://storage.googleapis.com/unabiz-media/sigfox-gcloud/pubsub-url.png" width="500"></kbd>](https://storage.googleapis.com/unabiz-media/sigfox-gcloud/pubsub-url.png)
    
### Setting the Sigfox callback

1.  As a Sigfox device maker you should have access to the *Sigfox Backend Portal*.
    We shall use the portal to configure the callback URL for
    your device.
    
    If you're not a Sigfox device maker yet, you may purchase the
    **UnaShield Sigfox Shield for Arduino** to get access to the
    Sigfox Backend.

    https://github.com/UnaBiz/unabiz-arduino/wiki/UnaShield

1. Log on to the [**Sigfox Backend Portal**](https://backend.sigfox.com)<br>
    Click **"Device Type"**<br>
    Click the Device Type that you wish to connect to Google Cloud<br>
    
    [<kbd><img src="https://storage.googleapis.com/unabiz-media/sigfox-gcloud/device-type.png" width="1024"></kbd>](https://storage.googleapis.com/unabiz-media/sigfox-gcloud/device-type.png)
    
1.  Click **"Callbacks"**

    [<kbd><img src="https://storage.googleapis.com/unabiz-media/sigfox-gcloud/device-type-callbacks.png" width="1024"></kbd>](https://storage.googleapis.com/unabiz-media/sigfox-gcloud/device-type-callbacks.png)

1.  Click **"New"**

    [<kbd><img src="https://storage.googleapis.com/unabiz-media/sigfox-gcloud/sigfox-callback-new.png" width="1024"></kbd>](https://storage.googleapis.com/unabiz-media/sigfox-gcloud/sigfox-callback-new.png)
    
1.  When prompted to select the callback type, select **Custom Callback**
    
    [<kbd><img src="https://storage.googleapis.com/unabiz-media/sigfox-gcloud/callback-custom.png" width="800"></kbd>](https://storage.googleapis.com/unabiz-media/sigfox-gcloud/callback-custom.png)
    
1.  Fill in the callback details as follows:

    [<kbd><img src="https://storage.googleapis.com/unabiz-media/sigfox-gcloud/sigfox-callback.png" width="1024"></kbd>](https://storage.googleapis.com/unabiz-media/sigfox-gcloud/sigfox-callback.png)
    
    -  **Type**: <br>
        **`DATA, BIDIR`**
    
    -  **Channel**: <br>
        **`URL`**
    
    -  **Send duplicate**: <br>
        **Unchecked (No)**
    
    -  **Custom payload config**: <br>
        **(Blank)**
    
    -  **URL Pattern**: <br>
        Enter the **Sigfox Callback URL**
        that we have copied earlier.  It should look like:   
        `https://us-central1-myproject.cloudfunctions.net/sigfoxCallback`          

    -  **Use HTTP Method**: <br>
        **`POST`**
        
    -  **Send SNI**: <br>
        **Checked (Yes)**

    -  **Headers**: <br>
        **(Blank)**

    -  **Content Type**: <br>
        **`application/json`**
            
    - Set the **Body** (Sigfox message payload) as:

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
    
        With this setting, the Sigfox cloud will deliver
        messages to our server in JSON format like this:
        
        ```json
        {
          "device":"1A2345",
          "data":"920e82002731b01db0512201",
          "time":"1476980426",
          "duplicate":"false",
          "snr":"18.86",
          "station":"1234",
          "avgSnr":"15.54",
          "lat":"1",
          "lng":"104",
          "rssi":"-123.00",
          "seqNumber":"1492",
          "ack":"false",
          "longPolling":"false"
        }
        ```

    -   **Optional:** We may set the callback type in the `sigfoxCallback` URL by
        passing the `type` parameter in the URL like this:

        ```
        https://us-central1-myproject.cloudfunctions.net/sigfoxCallback?type=gps
        ```
    
        It's OK to omit the `type` parameter, we may also use routing rules
        to define the processing steps.

### Optional: Configuring Sigfox downlink

**Optional:** The `sigfox-gcloud` server can be used to return downlink data to the Sigfox device after processing a callback from the Sigfox cloud.
If we plan to use the downlink capability, there are two additional things to configure:

1.  In the Device Type settings, set the **Downlink Mode** to **Callback** 

    [<kbd><img src="https://storage.googleapis.com/unabiz-media/sigfox-gcloud/downlink-callback.png" width="500"></kbd>](https://storage.googleapis.com/unabiz-media/sigfox-gcloud/downlink-callback.png)

1.  In the Callbacks list under Device Type, there is a hollow circle in the **Downlink** column.  
    Click the circle and change it to a filled purple circle

    [<kbd><img src="https://storage.googleapis.com/unabiz-media/sigfox-gcloud/downlink-enable.png" width="1024"></kbd>](https://storage.googleapis.com/unabiz-media/sigfox-gcloud/downlink-enable.png)

1.  The message handling code in `sigfoxCallback` is presently hardcoded to return `0123456789abcdef`.
    This may be changed if necessary.

    https://github.com/UnaBiz/sigfox-gcloud/blob/master/sigfoxCallback/index.js
    ```javascript
    function getResponse(req, device0, body /* , msg */) {
      //  Compose the callback response to Sigfox Cloud and return as a promise.
      //  If body.ack is true, then we must wait for the result and return to Sigfox as the downlink data.
      //  Else tell Sigfox we will not be returning any downlink data.
    ...
      //  Wait for the result.  Must be 8 bytes hex.
      //  TODO: We hardcode the result for now.
      const result = '0123456789abcdef';
    ```
    
1.  To write a program for the UnaShield Sigfox Shield to send a downlink request, refer to 
    https://github.com/UnaBiz/unabiz-arduino/wiki/Downlink

### Optional: Defining the Sigfox message processing steps

1.  We define the Sigfox message processing steps as a **route** in the 
    **Google Cloud Common Instance Metadata Store.**
    This metadata store is a key-value store that's shared by all 
    programs running in the same Google Cloud project.
      
    You may inspect and update the route through the 
    [**Google Cloud Compute Engine Metadata Editor**](https://console.cloud.google.com/compute/metadata).
    Look for the key named `sigfox-route`.

    [<kbd><img src="https://storage.googleapis.com/unabiz-media/sigfox-gcloud/metadata-route.png" width="640"></kbd>](https://storage.googleapis.com/unabiz-media/sigfox-gcloud/metadata-route.png)

1.    A route looks like

    ```
    decodeStructuredMessage, logToGoogleSheets, ...
    ```
    
    in which `decodeStructuredMessage` and `logToGoogleSheets` are the Google Cloud Functions to be called sequentially.
    These Cloud Functions will subscribe to the following Google PubSub queues to listen for Sigfox messages:
    
    ```
    sigfox.types.decodeStructuredMessage
    sigfox.types.logToGoogleSheets
    ```

1.  Here is an example of a route for Sigfox message processing, as shown in the demo.

    Sigfox Cloud
    
    → [`sigfoxCallback` cloud function](https://github.com/UnaBiz/sigfox-gcloud/tree/master/sigfoxCallback)
      to ingest messages from Sigfox Cloud
          
    → `sigfox.devices.all` message queue
    
    → [`routeMessage` cloud function](https://github.com/UnaBiz/sigfox-gcloud/tree/master/routeMessage) to route the message
    
    → `sigfox.types.decodeStructuredMessage` message queue 

    → [`decodeStructuredMessage` cloud function](https://github.com/UnaBiz/sigfox-gcloud/tree/master/decodeStructuredMessage)
      to decode the structured sensor data in the message
    
    → `sigfox.types.logToGoogleSheets` message queue
    
    → [`logToGoogleSheets` cloud function](https://github.com/UnaBiz/sigfox-gcloud/tree/master/logToGoogleSheets) to write the decoded message to Google Sheets

    [<kbd><img src="https://storage.googleapis.com/unabiz-media/sigfox-gcloud/sigfox-gcloud-arch.svg" width="1024"></kbd>](https://storage.googleapis.com/unabiz-media/sigfox-gcloud/sigfox-gcloud-arch.svg)
    
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
      Sigfox message by reading the `sigfox-route` from the Google Compute Metadata Store. 
      The route looks like this: 

      ```
      decodeStructuredMessage, logToGoogleSheets
      ```

    - This route sends the message to functions `decodeStructuredMessage` and `logToGoogleSheets`
      via the queues `sigfox.types.decodeStructuredMessage` and `sigfox.types.logToGoogleSheets`

1.  See this for the definition of structured messages:

    https://github.com/UnaBiz/unabiz-arduino/wiki/UnaShield

### Viewing `sigfox-gcloud` server logs

You may view the logs through the
[Google Cloud Logging Console](https://console.cloud.google.com/logs/viewer?resource=cloud_function&minLogLevel=0&expandAll=false)  
Select **"Cloud Function"** as the **"Resource"**
        
[<kbd><img src="https://storage.googleapis.com/unabiz-media/sigfox-gcloud/gcloud-log2.jpg" width="1024"></kbd>](https://storage.googleapis.com/unabiz-media/sigfox-gcloud/gcloud-log2.png)
    
From the screen above you can see the logs generated as each Sigfox message is processed in stages by `sigfox-gcloud`:

-   **Sigfox Device IDs** are shown in square brackets e.g. `[ 2C30EB ]`

-   **Completed Steps** are denoted by `_<<_`

-   **`sigfoxCallback`** is the Google Cloud Function that listens for incoming HTTPS messages delivered by Sigfox

-   **`routeMessage`** passes the Sigfox message to various Google Cloud Functions to decode and process the message

-   **`decodeStructuredMessage`** decodes a compressed Sigfox message that contains multiple field names and field values

-   **`sendToUbidots`** is a Google Cloud Function that sends the decoded sensor data to Ubidots via the Ubidots API.
    See [`sigfox-gcloud-ubidots`](https://www.npmjs.com/package/sigfox-gcloud-ubidots)

### Tracing `sigfox-gcloud` server performance

The
[Google Cloud Trace Console](https://console.cloud.google.com/traces/traces)
shows you the time taken by each step of the Sigfox message processing pipeline, tracing the message through every Google Cloud Function.

[<kbd><img src="https://storage.googleapis.com/unabiz-media/sigfox-gcloud/gcloud-trace.jpg" width="1024"></kbd>](https://storage.googleapis.com/unabiz-media/sigfox-gcloud/gcloud-trace.png)

Each message delivered by Sigfox appears as a separate trace timeline.  Messages are shown like `2C30EB seq:1913`
where `2C30EB` is the **Sigfox Device ID** and `1913` is the **Sigfox Message Sequence Number (seqNumber)**

The Google Stackdriver Trace API needs to be [enabled manually](https://console.cloud.google.com/apis/library/cloudtrace.googleapis.com/?q=trace&project=iteunabiz&organizationId=300017972478).

Custom reports may be created in Google Cloud Trace Control to benchmark the performance of each processing step over time.

[<kbd><img src="https://storage.googleapis.com/unabiz-media/sigfox-gcloud/gcloud-report-detail.jpg" width="1024"></kbd>](https://storage.googleapis.com/unabiz-media/sigfox-gcloud/gcloud-report-detail.png)

[<kbd><img src="https://storage.googleapis.com/unabiz-media/sigfox-gcloud/gcloud-trace-overview.jpg" width="800"></kbd>](https://storage.googleapis.com/unabiz-media/sigfox-gcloud/gcloud-trace-overview.png)

[<kbd><img src="https://storage.googleapis.com/unabiz-media/sigfox-gcloud/gcloud-trace-report.jpg" width="400"></kbd>](https://storage.googleapis.com/unabiz-media/sigfox-gcloud/gcloud-trace-report.png)

### Understanding and Troubleshooting the `sigfox-gcloud` server

To understand each processing step in the `sigfox-gcloud` server, you may use the
[Google Cloud Debug Console](https://console.cloud.google.com/debug)
to set breakpoints and capture in-memory variable values for each Google Cloud Function, without stopping or reconfiguring the server.

In the example below, we have set a breakpoint in the `sigfoxCallback` Google Cloud Function.  The captured in-memory
values are displayed at right - you can see the **Sigfox message** that was received by the callback.
The **Callback Stack** appears at the lower right.

Google Cloud Debug is also useful for troubleshooting your custom message processing code without having to insert the
debugging code yourself.

[<kbd><img src="https://storage.googleapis.com/unabiz-media/sigfox-gcloud/gcloud-debug.jpg" width="1024"></kbd>](https://storage.googleapis.com/unabiz-media/sigfox-gcloud/gcloud-debug.png)
        
### Testing the `sigfox-gcloud` server

1.  Send some Sigfox messages from the Sigfox devices. Monitor the progress
    of the processing through the 
    [Google Cloud Logging Console.](https://console.cloud.google.com/logs/viewer?resource=cloud_function&minLogLevel=0&expandAll=false)  
    Select **"Cloud Function"** as the **"Resource"**

    [<kbd><img src="https://storage.googleapis.com/unabiz-media/sigfox-gcloud/gcloud-log2.jpg" width="1024"></kbd>](https://storage.googleapis.com/unabiz-media/sigfox-gcloud/gcloud-log2.png)
                
1.  Processing errors will be reported to the 
    [Google Cloud Error Reporting Console.](https://console.cloud.google.com/errors?time=P1D&filter&order=COUNT_DESC)
            
    [<kbd><img src="https://storage.googleapis.com/unabiz-media/sigfox-gcloud/gcloud-error-reporting.png" width="1024"></kbd>](https://storage.googleapis.com/unabiz-media/sigfox-gcloud/gcloud-error-reporting.png)
    
1.  The [Google Cloud PubSub Console](https://console.cloud.google.com/cloudpubsub/topicList) 
    shows the message queues that have been created
    and how many Cloud Functions are listening to each queue.
           
    [<kbd><img src="https://storage.googleapis.com/unabiz-media/sigfox-gcloud/pubsub-topics.png" width="500"></kbd>](https://storage.googleapis.com/unabiz-media/sigfox-gcloud/pubsub-topics.png)
        
1.  We may configure 
    [Google Cloud Stackdriver Monitoring](https://app.google.stackdriver.com/services/cloud_pubsub/topics) 
    to create incident
    reports upon detecting any errors.  Stackdriver may also be used to
    generate dashboards for monitoring the PubSub message processing queues.       
    
    [<kbd><img src="https://storage.googleapis.com/unabiz-media/sigfox-gcloud/gcloud-stackdriver.png" width="1024"></kbd>](https://storage.googleapis.com/unabiz-media/sigfox-gcloud/gcloud-stackdriver.png)

1.  To check whether the downlink was sent successfully from the server to the device, check the Sigfox Backend.
    Go to the Device page, click Messages and click the down-arrow circle in the Callbacks column.
    It should show status "Acked"

    [<kbd><img src="https://storage.googleapis.com/unabiz-media/sigfox-gcloud/downlink-acked.png" width="1024"></kbd>](https://storage.googleapis.com/unabiz-media/sigfox-gcloud/downlink-acked.png)

1.  If the status is "Pending", the Sigfox network is still attempting to push the downlink message to the device.

    [<kbd><img src="https://storage.googleapis.com/unabiz-media/sigfox-gcloud/downlink-pending.png" width="1024"></kbd>](https://storage.googleapis.com/unabiz-media/sigfox-gcloud/downlink-pending.png)
        
        
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

1. To test the structured message decoding, send a Sigfox message
    from your Sigfox device with the `data` field set to:

    ```
    920e82002731b01db0512201
    ```
   
   We may also use a URL testing tool like Postman to send a POST request to the `sigfoxCallback` URL e.g.
      
   `https://us-central1-myproject.cloudfunctions.net/sigfoxCallback`

   Set the `Content-Type` header to `application/json`. 
   If you're using Postman, click `Body` -> `Raw` -> `JSON (application/json)`
   Set the body to:
   
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
    
    Here's the request in Postman:
    
     [<kbd><img src="https://storage.googleapis.com/unabiz-media/sigfox-gcloud/postman-callback.png" width="1024"></kbd>](https://storage.googleapis.com/unabiz-media/sigfox-gcloud/postman-callback.png)
     
    We may use the `curl` command as well.  Remember to change `myproject` and `1A2345`
    to your project ID and device ID.

    ```bash
    curl --request POST \
      --url https://us-central1-myproject.cloudfunctions.net/sigfoxCallback \
      --header 'cache-control: no-cache' \
      --header 'content-type: application/json' \
      --data '{"device":"1A2345", "data":"920e82002731b01db0512201", "time":"1476980426", "duplicate":"false", "snr":"18.86", "station":"0000", "avgSnr":"15.54", "lat":"1", "lng":"104", "rssi":"-123.00", "seqNumber":"1492", "ack":"false", "longPolling":"false"}'
    ```
    
1.  The response from the callback function should look like this:
    
    ```json
    {
      "1A2345": {
        "noData": true
      }
    }
    ```
           
1. The test message sent above will be decoded and displayed in the Google Sheet as 

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

1. Edit the Cloud Function deployment script  
    [`deploy.sh`](https://github.com/UnaBiz/sigfox-gcloud/blob/master/decodeStructuredMessage/deploy.sh#L3-L5).
    Edit the `name` parameter and replace the value by the name of
    your message processing function, e.g. `myfunction`.
    
    Any message delivered to the queue `sigfox.types.myfunction` will trigger the
    message processing function.

      ```bash
      name=myfunction
      trigger=--trigger-topic
      topic=sigfox.types.${name}
      ```

1. Create the listen queue in 
    [*Google PubSub Console*](https://console.cloud.google.com/cloudpubsub/topicList), 
    e.g. `sigfox.types.myfunction`

    Or run this command (change `myfunction` to the function name):
    ```bash
    gcloud beta pubsub topics create sigfox.types.myfunction
    ```
        
1. Edit the message processing code in 
    [`index.js`](https://github.com/UnaBiz/sigfox-gcloud/blob/master/decodeStructuredMessage/index.js).  
    Every message processing function has 3 sections:
   
   - [**Common Declarations**](https://github.com/UnaBiz/sigfox-gcloud/blob/master/decodeStructuredMessage/index.js#L10-L24)
   
      ```javascript
      if (process.env.FUNCTION_NAME) {
        require('@google-cloud/trace-agent').start();
        require('@google-cloud/debug-agent').start();
      }
      const sgcloud = require('sigfox-gcloud');
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
      
       To write debug messages to the Google Cloud Logging Console, call 
       `sgcloud.log(req, action, parameters)` like this:
       
          sgcloud.log(req, 'decodeMessage', { result, body });

       To report errors to the Google Cloud Error Reporting Console, call
       `sgcloud.log(req, action, parameters)`, where `parameters` includes 
       an `error` field containing the JavaScript error.

           sgcloud.log(req, 'decodeMessage', { error, body });
      
   - [**Main Function**](https://github.com/UnaBiz/sigfox-gcloud/blob/master/decodeStructuredMessage/index.js#L26-L95)

      ```javascript
      exports.main = event => sgcloud.main(event, task);
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

1. Deploy the module. This creates/updates the Google Cloud Function and listens
   to the PubSub queue for new messages to be processed by the function.
 
    ```bash
    ./deploy.sh
    ```

1. Update the Sigfox message processing route `sigfox-route` in
    [**Google Cloud Compute Engine Metadata Editor**](https://console.cloud.google.com/compute/metadata).
    Add the new processing step to the list of steps:

     ```
     decodeStructuredMessage, logToGoogleSheets
     ```
    
    The new route will take effect in 10 seconds when the
    route cache is refreshed.

1. To test, send a Sigfox message from your Sigfox device.

# `sigfox-gcloud-ubidots` adapter for Ubidots

The [`sigfox-gcloud-ubidots`](https://www.npmjs.com/package/sigfox-gcloud-ubidots) adapter is a Google Cloud Function 
(developed with the `sigfox-gcloud` framework) that integrates with **Ubidots** to provide a comprehensive IoT 
platform for Sigfox.

With Ubidots and `sigfox-gcloud-ubidots`, you may easily visualise sensor data from your Sigfox devices and monitor
for alerts. To perform custom processing of your Sigfox device messages before passing to Ubidots, 
you may write a Google Cloud Function with the `sigfox-gcloud` framework.  

`sigfox-gcloud-ubidots` also lets you to visualise in real-time the **Sigfox Geolocation** data from your Sigfox devices, 
or other kinds of GPS tracking data.  For details, check out:

[`https://www.npmjs.com/package/sigfox-gcloud-ubidots`](https://www.npmjs.com/package/sigfox-gcloud-ubidots)

[`https://unabiz.github.io/unashield/ubidots`](https://unabiz.github.io/unashield/ubidots)

[<kbd><img src="https://storage.googleapis.com/unabiz-media/sigfox-gcloud/ubidots-dashboard.jpg" width="800"></kbd>](https://storage.googleapis.com/unabiz-media/sigfox-gcloud/ubidots-dashboard.png)

[<kbd><img src="https://storage.googleapis.com/unabiz-media/sigfox-gcloud/ubidots-device-list.jpg" width="800"></kbd>](https://storage.googleapis.com/unabiz-media/sigfox-gcloud/ubidots-device-list.png)

[<kbd><img src="https://storage.googleapis.com/unabiz-media/sigfox-gcloud/ubidots-device.jpg" width="800"></kbd>](https://storage.googleapis.com/unabiz-media/sigfox-gcloud/ubidots-device.png)

