#!/bin/bash
set -e

process_result() {
  success_message=$'\e[32mSuccess!'
  failure_message=$'\e[91mTest failed.'

  if [ $1 -eq 0 ]
  then
    echo $success_message
  else
    echo $failure_message
    exit 1
  fi
}

echo $'\e[34mLinking SASjs CLI...'
npm link
if [ $? -eq 0 ]
then
  echo $'\e[32mSuccess: SASjs CLI linked.'
else
  echo $'\e[91mError: Could not link SASjs CLI.'
  exit 1
fi

echo $'\e[34mSASjs Version'
sasjs v
process_result $?

echo $'\e[34mSASjs Create'
sasjs create test1
process_result $?

echo $'\e[34mSASjs Create Minimal App'
sasjs create test2 -t minimal
process_result $?

echo $'\e[34mSASjs Create React App'
sasjs create test3 -t react
process_result $?

echo $'\e[34mSASjs Create Angular App'
sasjs create test4 -t angular
process_result $?

echo $'\e[34mSASjs Create SAS Only App'
sasjs create test5 -t sasonly
process_result $?

echo $'\e[34mSASjs Compile Build'
cd test5
sasjs cb
process_result $?
cd -

echo $'\e[34mCleaning up...'
rm -rf test1
rm -rf test2
rm -rf test3
rm -rf test4
rm -rf test5
