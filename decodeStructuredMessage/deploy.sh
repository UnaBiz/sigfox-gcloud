#!/bin/bash

name=decodeStructuredMessage
trigger=--trigger-topic
topic=sigfox.types.${name}

./functiondeploy.sh ${name}   ${name} ${trigger} ${topic}
#./functiondeploy.sh ${name}01 ${name} ${trigger} ${topic}
#./functiondeploy.sh ${name}02 ${name} ${trigger} ${topic}
#./functiondeploy.sh ${name}03 ${name} ${trigger} ${topic}
