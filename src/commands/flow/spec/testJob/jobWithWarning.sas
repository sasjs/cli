data yury; was='here';
data new; was='toolong';
proc append base=yury data=new force;
run;