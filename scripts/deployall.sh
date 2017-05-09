#!/usr/bin/env bash

./sigfoxCallback/deploy.sh
./routeMessage/deploy.sh
./logToGoogleSheets/deploy.sh
./decodeStructuredMessage/deploy.sh

echo ========= All Deployed! =========
