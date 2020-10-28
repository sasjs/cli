parmcards4;
  %webout(FETCH)
  %webout(OPEN)
  %macro x();
  %do i=1 %to %sysfunc(countw(&sasjs_tables));
    %let table=%scan(&sasjs_tables,&i);
    %webout(ARR,&table)
  %end;
  %mend;
  %x()
  %webout(CLOSE)