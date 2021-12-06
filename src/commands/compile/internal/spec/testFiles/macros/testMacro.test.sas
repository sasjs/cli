/**
  @file
  @sastype_test
  @brief testing macro

  <h4> SAS Macros </h4>
  @li mp_assert.sas
**/

%put this is a test;

%assert(msg=My Test for macro,result=FAIL)

%webout(OPEN)
%webout(OBJ,test_results)
%webout(CLOSE)