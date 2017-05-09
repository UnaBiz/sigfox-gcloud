#!/bin/bash

name=logToGoogleSheets
trigger=--trigger-topic
topic=sigfox.types.${name}

./scripts/functiondeploy.sh ${name}   ${name} ${trigger} ${topic}
#./scripts/functiondeploy.sh ${name}01 ${name} ${trigger} ${topic}
#./scripts/functiondeploy.sh ${name}02 ${name} ${trigger} ${topic}
#./scripts/functiondeploy.sh ${name}03 ${name} ${trigger} ${topic}
