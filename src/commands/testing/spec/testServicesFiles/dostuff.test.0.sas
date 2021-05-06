%put 'dostuff.test.0.sas';
data TEST_RESULTS;
test_description="dostuff 0 test description";
test_result="FAIL";
output;
run;
%WEBOUT(OPEN)
%WEBOUT(OBJ, TEST_RESULTS)
%WEBOUT(CLOSE)