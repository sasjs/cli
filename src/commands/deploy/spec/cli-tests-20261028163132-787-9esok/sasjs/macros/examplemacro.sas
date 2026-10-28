/**
  @file examplemacro.sas
  @brief an example of a macro to be used in a service
  @details  This macro is great. Yadda yadda yadda.  Usage:

    * code formatting applies when indented by 4 spaces;
    %examplemacro()

  <h4> SAS Macros </h4>
  @li doesnothing.sas

  @author Allan Bowe
**/

%macro examplemacro();

proc sql;
create table areas
  as select area
from sashelp.springs;

%doesnothing()

%mend;
