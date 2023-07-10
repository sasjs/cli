#!/bin/bash

if npm ci --omit=dev --ignore-scripts 2>&1 | grep -i warn;
then
    echo "Warnings are found when doing production install"
    exit 1
else
    echo "No warnings found when doing production install"
fi