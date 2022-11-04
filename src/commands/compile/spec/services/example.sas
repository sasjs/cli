/**
  @file example.sas
  @brief example service - for example 
  @details  This is a longer description.

  <h4> SAS Macros </h4>
  @li mf_nobs.sas
  @li examplemacro.sas
  @li yetanothermacro.sas
  
  <h4> SAS Includes </h4>
  @li doesnotexist.sas SOMEREF

**/

%put %mf_nobs(sashelp.class);

%examplemacro()
%yetanothermacro()

%webout(OPEN)
%webout(OBJ,areas)
%webout(CLOSE)
