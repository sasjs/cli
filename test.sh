#!/bin/bash

echo "\e[96mInstalling \e[96mSASjs \e[96mCLI..."
npm install -g @sasjs/cli
if [ $? -eq 0 ]
then
  echo "\e[32mSuccess: SASjs CLI installed."
else
  echo "\e[91mError: Could not install SASjs CLI."
  exit 1
fi

echo "\e[96mSASjs \e[96mVersion"
sasjs v
if [ $? -eq 0 ]
then
  echo "\e[32mSuccess!"
else
  echo "\e[91mTest \e[91mfailed."
  exit 1
fi

echo "\e[96mSASjs \e[96mCreate"
sasjs create test1
if [ $? -eq 0 ]
then
  echo "\e[32mSuccess!"
else
  echo "\e[91mTest \e[91mfailed."
  exit 1
fi

echo "\e[96mSASjs \e[96mCreate \e[96mMinimal \e[96mApp"
sasjs create test2 -t minimal
if [ $? -eq 0 ]
then
  echo "\e[32mSuccess!"
else
  echo "\e[91mTest \e[91mfailed."
  exit 1
fi

echo "\e[96mSASjs \e[96mCreate \e[96mReact \e[96mApp"
sasjs create test3 -t react
if [ $? -eq 0 ]
then
  echo "\e[32mSuccess!"
else
  echo "\e[91mTest \e[91mfailed."
  exit 1
fi

echo "\e[96mSASjs \e[96mCreate \e[96mAngular \e[96mApp"
sasjs create test4 -t angular
if [ $? -eq 0 ]
then
  echo "\e[32mSuccess!"
else
  echo "\e[91mTest \e[91mfailed."
  exit 1
fi

echo "SASjs Create SAS Only App"
sasjs create test5 -t sasonly
if [ $? -eq 0 ]
then
  echo "\e[32mSuccess!"
else
  echo "\e[91mTest failed."
  exit 1
fi