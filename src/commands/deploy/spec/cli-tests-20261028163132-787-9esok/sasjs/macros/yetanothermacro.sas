/**
  @file yetanothermacro.sas
  @brief Yet another example of a macro to be used in a service
  @details  This macro is also great. Yadda yadda yadda. 

  <h4> SAS Macros </h4>
  @li doesnothing.sas

**/

%macro yetanothermacro();

proc sort data= areas nodupkey;
 by area;
run;
%doesnothing()

%mend;
