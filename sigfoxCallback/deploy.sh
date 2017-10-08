#!/bin/bash

name=sigfoxCallback
trigger=--trigger-http
topic=
# Test with a larger memory size and timeout.
export options="--memory=1024MB --timeout=500"

./scripts/functiondeploy.sh ${name}   ${name} ${trigger} ${topic}
#./scripts/functiondeploy.sh ${name}01 ${name} ${trigger} ${topic}
#./scripts/functiondeploy.sh ${name}02 ${name} ${trigger} ${topic}
#./scripts/functiondeploy.sh ${name}03 ${name} ${trigger} ${topic}
