/**
  @file
  @brief <Your brief here>
  <h4> SAS Macros </h4>
**/
%put 'random.test.0.sas';
data work.test_results;
length test_result $5 test_description $256 test_comments $256;
test_description="random 0 test description";
test_result="FAIL";
output;
run;
%webout(OPEN)
%webout(OBJ, test_results)
%webout(CLOSE)