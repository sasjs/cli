%put 'examplemacro.test.1.sas';
data work.test_results;
test_description="examplemacro test.1 description";
test_result="PASS";
output;
run;
%webout(OPEN)
%webout(OBJ, test_results)
%webout(CLOSE)