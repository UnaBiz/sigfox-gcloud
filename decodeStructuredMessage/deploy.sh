#!/usr/bin/env bash

name=decodeStructuredMessage
trigger=--trigger-topic
topic=sigfox.types.${name}
export options="--memory=1024MB --timeout=500"

./scripts/functiondeploy.sh ${name}   ${name} ${trigger} ${topic}
