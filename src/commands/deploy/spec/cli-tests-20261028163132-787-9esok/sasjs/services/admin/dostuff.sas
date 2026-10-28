/**
  @file dostuff.sas
  @brief example file
  @details  This service does stuff. Like - ya know - stuff.

  <h4> SAS Macros </h4>
  @li mv_createfolder.sas
  @li mm_getauthinfo.sas

**/

data stuff;set sashelp.class;run;
%webout(OPEN)
%webout(OBJ,stuff)
%webout(CLOSE)
