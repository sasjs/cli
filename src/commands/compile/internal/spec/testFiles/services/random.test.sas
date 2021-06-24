/**
  @file
  @brief <Your brief here>
  <h4> SAS Macros </h4>
  @li mf_abort.sas
**/
%put 'random.test.sas';
data work.test_results;
test_description="random test description";
test_result="PASS";
output;
run;
%webout(OPEN)
%webout(OBJ, test_results)
%webout(CLOSE)