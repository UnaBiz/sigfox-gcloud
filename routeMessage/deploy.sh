#!/bin/bash

name=routeMessage
trigger=--trigger-topic
topic=sigfox.devices.all

./functiondeploy.sh ${name}   ${name} ${trigger} ${topic}
#./functiondeploy.sh ${name}01 ${name} ${trigger} ${topic}
#./functiondeploy.sh ${name}02 ${name} ${trigger} ${topic}
#./functiondeploy.sh ${name}03 ${name} ${trigger} ${topic}
