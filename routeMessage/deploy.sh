#!/usr/bin/env bash

name=routeMessage
trigger=--trigger-topic
topic=sigfox.devices.all
export options="--memory=1024MB --timeout=500"

./scripts/functiondeploy.sh ${name}   ${name} ${trigger} ${topic}
