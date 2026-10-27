/**
  @file truncated-header.sas
  @brief A file whose header carries a block comment
  @details a usage example with a comment in it:

      data _null_;
        /* this comment closes the header */
        set work.status;
      run;

**/

%put hello;
