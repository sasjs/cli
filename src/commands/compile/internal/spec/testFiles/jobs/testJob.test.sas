/**
  @file
  @sastype_test
  @brief testing runjob1

  <h4> SAS Macros </h4>
  @li mp_assert.sas
**/

%put this is a test;

%assert(msg=My Test for runjob1,result=FAIL)

%webout(OPEN)
%webout(OBJ,test_results)
%webout(CLOSE)