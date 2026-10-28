/**
  @file appinit.sas
  @brief Initialisation service - runs on app startup
  @details  This is always the first service called when the app is opened.

  <h4> SAS Macros </h4>

**/

proc sql;
create table areas as select distinct area
  from sashelp.springs;
%webout(OPEN)
%webout(OBJ,areas)
%webout(CLOSE)
