#!/bin/bash

echo "Installing SASjs CLI..."
npm install -g @sasjs/cli
if [ $? -eq 0 ]
then
  echo "SASjs CLI successfully installed."
else
  echo "Could not install SASjs CLI"
  exit 1
fi

echo "SASjs Version"
sasjs v
if [ $? -eq 0 ]
then
  echo "Success!"
else
  echo "Test failed."
  exit 1
fi

echo "SASjs Create"
sasjs create test1
if [ $? -eq 0 ]
then
  echo "Success!"
else
  echo "Test failed."
  exit 1
fi

echo "SASjs Create Minimal App"
sasjs create test2 -t minimal
if [ $? -eq 0 ]
then
  echo "Success!"
else
  echo "Test failed."
  exit 1
fi

echo "SASjs Create React App"
sasjs create test3 -t react
if [ $? -eq 0 ]
then
  echo "Success!"
else
  echo "Test failed."
  exit 1
fi

echo "SASjs Create Angular App"
sasjs create test4 -t angular
if [ $? -eq 0 ]
then
  echo "Success!"
else
  echo "Test failed."
  exit 1
fi

echo "SASjs Create SAS Only App"
sasjs create test5 -t sasonly
if [ $? -eq 0 ]
then
  echo "Success!"
else
  echo "Test failed."
  exit 1
fi