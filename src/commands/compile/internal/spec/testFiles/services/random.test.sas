/**
  @file
  @brief <Your brief here>
  <h4> SAS Macros </h4>
  @li mf_abort.sas
**/
%put 'random.test.sas';
data work.test_results;
length test_result $5 test_description $256 test_comments $256;
test_description="random test description";
test_result="PASS";
output;
run;
%webout(OPEN)
%webout(OBJ, test_results)
%webout(CLOSE)