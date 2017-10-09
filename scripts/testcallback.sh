#!/usr/bin/env bash
# Test the Sigfox Callback by sending a series of HTTP requests to simulate
# POSTing of messages. Good for measuring response time.

# Set the GCLOUD_PROJECT environment variable from .env
export GCLOUD_PROJECT
. .env

# Send 20 test requests.
for i in {1..10}
do
  # Wait 10 seconds between tests.
  sleep 10

  # Simulate Sigfox Callback for device ID 2C30EA
  # wget command was exported from Postman. Remove all "\r\n" from body-data.
  /usr/bin/time \
    wget --verbose \
    --method POST \
    --header 'content-type: application/json' \
    --header 'cache-control: no-cache' \
    --body-data '{"device":"2C30EA",  "data":"b0513801a421f0019405a500",  "time":"1507396971",  "duplicate":"false",  "snr":"18.86",  "station":"1D44",  "avgSnr":"15.54",  "lat":"1",  "lng":"104",  "rssi":"-123.00",  "seqNumber":"1501",  "ack":"false",  "longPolling":"false"}' \
    --output-document \
    - https://us-central1-${GCLOUD_PROJECT}.cloudfunctions.net/sigfoxCallback

  # Wait 10 seconds between tests.
  sleep 10

  # Simulate Sigfox Callback for a different device ID 2C30EB and different Ubidots account.
  /usr/bin/time \
    wget --verbose \
      --method POST \
      --header 'content-type: application/json' \
      --header 'cache-control: no-cache' \
      --body-data '{  "device":"2C30EB",  "data":"b0513801a421f0019405a500",  "time":"1507396971",  "duplicate":"false",  "snr":"18.86",  "station":"1D44",  "avgSnr":"15.54",  "lat":"1",  "lng":"104",  "rssi":"-123.00",  "seqNumber":"1501",  "ack":"false",  "longPolling":"false"}' \
      --output-document \
      - https://us-central1-iteunabiz.cloudfunctions.net/sigfoxCallback

done
