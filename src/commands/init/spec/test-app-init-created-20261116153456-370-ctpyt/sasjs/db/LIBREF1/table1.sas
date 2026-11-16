/**
SAS files are provided here to enable initial values to be loaded to tables.
This is not the place for TEST data - that should be added as part of
a test suite.

SAS Datalines provide a very concise and controlled way to load data.  Such
programs can be generated using the following utility:

https://github.com/sasjs/core/blob/main/base/mp_ds2cards.sas

Tables should first be created in WORK then proc appended to the target (CURLIB)
library.

This comment can / should be deleted.

**/

data dim_product(index=(pk=(tx_from product_cd)/unique));
  retain tx_from 0;
  retain tx_to '31DEC9999:23:59:59'dt;
infile cards dsd;
input product_cd:$40. product_desc:$100.;
cards4;
001,some product
002,some other product
003,you get the picture
;;;;
run;

proc append base=&curlib..dim_product data=dim_product;
run;
