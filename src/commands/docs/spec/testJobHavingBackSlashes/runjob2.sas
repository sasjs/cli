/**
  @file
  @brief runjob2 \some text\\more
  @details Get a list of Viya users


  <h4> SAS Macros </h4>
  @li example.sas
  @li mv_getusers.sas

  <h4> Data Inputs </h4>
  @li sas9hrdb.test
  @li mylib.example
  @li mylib.demotable3

  <h4> Data Outputs </h4>
  @li mylib.users

**/

%let input1=sas9hrdb.test; /* example */
%let output1=&mylib..users;

%example(runjob2 is executing)

/* here we are using one of the @sasjs/core macros */
%mv_getusers(outds=users)

data &output1;
  set work.users;
run;

