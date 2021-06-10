/**
  @file
  @brief <Your brief here>
  <h4> SAS Macros </h4>
**/
data _null_;
  do x=1 to 21000;
    putlog x=;
  end;
run;

%put _all_;