/**
  @file
  @sastype_test
  @brief testing example.sas macro

  <h4> SAS Macros </h4>
  @li example.sas
  @li mp_assertscope.sas

**/


%let testvar=this is a test;
%mp_assertscope(SNAPSHOT)
%example(some message)
%mp_assertscope(COMPARE,desc=Checking macro variables against previous snapshot)
