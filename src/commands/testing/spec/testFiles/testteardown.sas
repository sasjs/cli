/**
  @file testteardown.sas
  @brief this file is called with every test
  @details  This file is included in *every* test, *after* the macros and *before* the test code.

  <h4> SAS Macros </h4>
  @li mf_abort.sas

**/

options 
  DATASTMTCHK=ALLKEYWORDS /* some sites have this enabled */
  PS=MAX /* reduce log size slightly */
;
%put test tear down!!;