#!/usr/bin/env bash

# Extract the GCloud key from environment variable GCLOUD_SERVICE_KEY
echo $GCLOUD_SERVICE_KEY | base64 --decode --ignore-garbage > ${HOME}/gcloud-service-key.json

# Needed for GCloud according to docs.
pyenv global 2.7.12

# Install Cloud Functions.
sudo /opt/google-cloud-sdk/bin/gcloud --quiet components update
sudo /opt/google-cloud-sdk/bin/gcloud --quiet components install beta

# Set the service account.
gcloud auth activate-service-account --key-file ${HOME}/gcloud-service-key.json
