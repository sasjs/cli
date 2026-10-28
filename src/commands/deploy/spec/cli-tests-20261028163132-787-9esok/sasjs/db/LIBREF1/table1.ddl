/**

DDL files provide the structure of a table and should be written as SQL
statements WITHOUT the `proc sql;` prefix.  This is to prevent subsequent
tables being created unnecessarily if there are any errors.

This comment can / should be removed.

The LIBREF (folder name) is passed in as a macro variable named `CURLIB`.

**/

create table &curlib..dim_product(
    tx_from num not null format=datetime19.3,
    tx_to num not null format=datetime19.3,
    product_cd char(40) not null,
    product_desc char(100) not null,
  constraint pk
    primary key(tx_from, product_cd));
