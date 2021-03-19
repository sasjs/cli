data _null_;
  y=repeat('W',500);
  do x=1 to 1e6;
    putlog y=;
  end;
run;