/**
  @file
  @brief <Your brief here>
  <h4> SAS Macros </h4>
**/
%put 'random.test.0.sas';
data work.test_results;
test_description="random 0 test description";
test_result="FAIL";
output;
run;
%webout(OPEN)
%webout(OBJ, test_results)
%webout(CLOSE)