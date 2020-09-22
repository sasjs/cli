#!/bin/bash

function process_result {
  if [ $? -eq 0 ]
  then
    echo $success_message
  else
    echo $failure_message
    exit 1
  fi
}

success_message="\e[32mSuccess!"
failure_message="\e[91mTest \e[91mfailed."

echo "\e[34mInstalling \e[34mSASjs \e[34mCLI..."
npm install -g @sasjs/cli
if [ $? -eq 0 ]
then
  echo "\e[32mSuccess: SASjs CLI installed."
else
  echo "\e[91mError: Could not install SASjs CLI."
  exit 1
fi

echo "\e[34mSASjs \e[34mVersion"
sasjs v
process_result

echo "\e[34mSASjs \e[34mCreate"
sasjs create test1
process_result

echo "\e[34mSASjs \e[34mCreate \e[34mMinimal \e[34mApp"
sasjs create test2 -t minimal
process_result

echo "\e[34mSASjs \e[34mCreate \e[34mReact \e[34mApp"
sasjs create test3 -t react
process_result

echo "\e[34mSASjs \e[34mCreate \e[34mAngular \e[34mApp"
sasjs create test4 -t angular
process_result

echo "SASjs Create SAS Only App"
sasjs create test5 -t sasonly
process_result
