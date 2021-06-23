/**
  @file
  @brief setting up the test suite
  <h4> SAS Macros </h4>
**/

%put testing, setup everything;

data work.test_results;
    test_description="some description";
    test_result="PASS";
    output;
  run;

%webout(OPEN)
%webout(OBJ, test_results)
%webout(CLOSE)