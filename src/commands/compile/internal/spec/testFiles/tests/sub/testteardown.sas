/**
  @file
  @brief tearing down the test suite
  <h4> SAS Macros </h4>
**/

%put testing, tear down everything;

data work.test_results;
    test_description="some description";
    test_result="FAIL";
    output;
  run;

%webout(OPEN)
%webout(OBJ, test_results)
%webout(CLOSE)