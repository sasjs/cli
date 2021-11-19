#!/bin/bash

if npm ci | grep -q 'warn';
then
    echo "Warnings are found when doing production install"
    exit 1
else
    echo "No warnings found when doing production install"
fi