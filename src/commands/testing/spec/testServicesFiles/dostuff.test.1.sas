%put 'dostuff.test.1.sas';
data TEST_RESULTS;
test_description="dostuff 1 test description";
test_result="PASS";
output;
run;
%WEBOUT(OPEN)
%WEBOUT(OBJ, TEST_RESULTS)
%WEBOUT(CLOSE)