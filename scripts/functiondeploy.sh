#!/usr/bin/env bash

# Set the GCLOUD_PROJECT environment variable from .env
export GCLOUD_PROJECT
. .env

name=$1
localpath=$2
trigger=$3
topic=$4
tmp=/tmp/cloudfunctions/${name}
bucket=${GCLOUD_PROJECT}.appspot.com

mkdir -p ${tmp}

# Copy index.js, routes.js and package.json.
echo ========= ${name} ========= cp ${localpath}/*.js* ${tmp}
cp ${localpath}/*.js* ${tmp}

# Copy Google credentials.
echo ========= ${name} ========= cp ./google-credentials.json ${tmp}
cp ./google-credentials.json ${tmp}

# Deploy to Google Cloud.
gcloud config set project ${GCLOUD_PROJECT}
gcloud config list project
echo ========= ${name} ========= gcloud beta functions deploy ${name} --quiet ${trigger} ${topic} --stage-bucket ${bucket} --local-path ${tmp} --entry-point main
gcloud beta functions deploy ${name} --quiet ${trigger} ${topic} --stage-bucket ${bucket} --local-path ${tmp} --entry-point main

# Purge after deploying.
echo ========= ${name} ========= ${tmp}/google-credentials.json
rm ${tmp}/google-credentials.json

echo ========= ${name} ========= rm -r ${tmp}
rm -r ${tmp}

echo ========= ${name} Deployed! =========
