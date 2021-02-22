/**
  @file
  @brief This code is inserted into the beginning of each Viya Job.
  @details Inserted during the `sasjs compile` step.  Add any code here that
  should go at the beginning of every deployed job.

  The path to this file should be listed in the `jobInit` property of the
  sasjsconfig file.

  <h4> Data Inputs </h4>
  @li LIB.test_input_1
  @li LIBf.test_input_4
  @li LIBf.test_input_5

  <h4> Data Outputs </h4>
  @li LND.test_output_1
  @li BOTH.as_input_and_output

  <h4> SAS Macros </h4>
  @li example.sas

**/

%example(Job Init is executing!)

%let mylib=WORK;