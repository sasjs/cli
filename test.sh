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

# Turning off this test until the seed apps have been migrated to the new target format
# echo $'\e[34mSASjs Compile Build'
# cd test5
# sasjs cb
# process_result $?
# cd -

echo $'\e[34mSASjs Format'
mkdir -p test6/sasjs
printf 'DATA x;\nSET y;\nRUN;\n' > test6/sasjs/app.sas
cd test6

# The engine loads through a native import() out of the compiled CommonJS, which
# is the one path jest cannot execute - it refuses a dynamic import of an ES
# module. Formatting a file here is what puts that path under a check, against the
# installed tarball rather than the source tree.
format_status=0
check_status=0
sasjs format > /dev/null || format_status=$?
sasjs format --check > /dev/null || check_status=$?
cd ..
rm -rf test6

if [ $format_status -eq 0 ] && [ $check_status -eq 0 ]
then
  echo $'\e[32mSuccess!'
else
  echo $'\e[91mTest failed.'
  exit 1
fi

echo $'\e[34mCleaning up...'
rm -rf test1
rm -rf test2
rm -rf test3
rm -rf test4
rm -rf test5
