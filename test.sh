#!/bin/bash

echo "Installing SASjs CLI..."
npm install -g @sasjs/cli
exit_code = $?
if [ $? -eq 0 ]
then
  echo "SASjs CLI successfully installed."
else
  echo "Could not install SASjs CLI"
  exit 1
fi

echo "SASjs Version"
sasjs v
exit_code = $?
if [ $? -eq 0 ]
then
  echo "Success!"
else
  echo "Test failed."
  exit 1
fi

echo "SASjs Create"
sasjs create test1
exit_code = $?
if [ $? -eq 0 ]
then
  echo "Success!"
else
  echo "Test failed."
  exit 1
fi

echo "SASjs Create Minimal App"
sasjs create test2 -t minimal
exit_code = $?
if [ $? -eq 0 ]
then
  echo "Success!"
else
  echo "Test failed."
  exit 1
fi

echo "SASjs Create React App"
sasjs create test3 -t react
exit_code = $?
if [ $? -eq 0 ]
then
  echo "Success!"
else
  echo "Test failed."
  exit 1
fi

echo "SASjs Create Angular App"
sasjs create test4 -t angular
exit_code = $?
if [ $? -eq 0 ]
then
  echo "Success!"
else
  echo "Test failed."
  exit 1
fi

echo "SASjs Create SAS Only App"
sasjs create test5 -t sasonly
exit_code = $?
if [ $? -eq 0 ]
then
  echo "Success!"
else
  echo "Test failed."
  exit 1
fi