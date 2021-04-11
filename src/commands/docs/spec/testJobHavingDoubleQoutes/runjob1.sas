/**
  @file
  @brief runjob1 " t"est"
  @details In the flow this is defined to run after the dependent flows have
  finished (successfully)


  <h4> SAS Macros </h4>
  @li example.sas
  @li mf_nobs.sas

  <h4> Data Outputs </h4>
  @li sas9hrdb.test

**/

%example(runjob1 is executing)

/* here we are using one of the @sasjs/core macros */
data work.somedata;
  x=%mf_nobs(sashelp.class);
run;

