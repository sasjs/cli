/**
  @file
  @brief This code is inserted at the end of each Viya Job.
  @details Inserted during the `sasjs compile` step.  Add any code here that
  should go at the end of every deployed job.

  The path to this file should be listed in the `jobTerm` property of the
  sasjsconfig file.

  <h4> Data Inputs </h4>
  @li LIB.test_input_1
  @li LIB.test_input_2
  @li LIBr.test_input_3
  @li LIBf.test_input_4
  @li BOTH.as_input_and_output

  <h4> Data Outputs </h4>
  @li LND.test_output_1
  @li LND.test_output_2
  @li LND.test_output_3
  @li LND.test_output_4

  <h4> SAS Macros </h4>
  @li example.sas

**/

%example(Job Term is executing!)