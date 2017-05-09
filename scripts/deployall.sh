#!/usr/bin/env bash

# Set the GCLOUD_PROJECT environment variable from .env
export GCLOUD_PROJECT
. .env

./sigfoxCallback/deploy.sh &
sleep 10
./routeMessage/deploy.sh &
sleep 10
./logToGoogleSheets/deploy.sh &
sleep 10
./decodeStructuredMessage/deploy.sh

echo ========= All Deployed! =========
