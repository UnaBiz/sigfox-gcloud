#!/usr/bin/env bash

# Set the GCLOUD_PROJECT environment variable from .env
export GCLOUD_PROJECT
. .env

name=$1
localpath=$2
trigger=$3
topic=$4
tmp=/tmp/cloudfunctions/${name}
bucket=${GCLOUD_PROJECT}-sigfox-gcloud

mkdir -p ${tmp}

# Copy index.js, routes.js and package.json.
echo ========= ${name} ========= cp ${localpath}/*.js* ${tmp}
cp ${localpath}/*.js* ${tmp}

# Copy Google credentials.
echo ========= ${name} ========= cp ./google-credentials.json ${tmp}
cp ./google-credentials.json ${tmp}

# Select Google Cloud project.
gcloud config set project ${GCLOUD_PROJECT}
gcloud config list project

# Generate source info for Google Cloud Debugger.
echo ========= ${name} ========= gcloud beta debug source gen-repo-info-file
gcloud beta debug source gen-repo-info-file
echo ========= ${name} ========= cp ./source-context.json ${tmp}
cp ./source-context.json ${tmp}
echo ========= ${name} ========= cp ./source-contexts.json ${tmp}
cp ./source-contexts.json ${tmp}
rm ./source-context.json
rm ./source-contexts.json

# Deploy to Google Cloud.
echo ========= ${name} ========= gcloud beta functions deploy ${name} --quiet ${trigger} ${topic} --stage-bucket ${bucket} --local-path ${tmp} --entry-point main  ${options}
gcloud beta functions deploy ${name} --quiet ${trigger} ${topic} --stage-bucket ${bucket} --local-path ${tmp} --entry-point main  ${options}

# Purge after deploying.
echo ========= ${name} ========= ${tmp}/google-credentials.json
rm ${tmp}/google-credentials.json

echo ========= ${name} ========= rm -r ${tmp}
rm -r ${tmp}

echo ========= ${name} Deployed! =========
