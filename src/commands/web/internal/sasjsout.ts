export const sasjsout = () => `
/* this macro is derived from: https://core.sasjs.io/mp__replace_8sas.html */
options mprint;
%macro mp_replace(infile,
  findvar=,
  replacevar=,
  outfile=0
)/*/STORE SOURCE*/;

%local inref outref dttm ds1 rc;
/* create filerefs */
%let rc=%sysfunc(filename(inref,,temp,lrecl=200));
%let rc=%sysfunc(filename(outref,,temp,lrecl=200));

%if &outfile=0 %then %let outfile=&infile;

/* uniquely named 32 char datasets */
%let ds1=all%substr(%sysfunc(compress(%sysfunc(uuidgen()),-)),1,29);
%let ds2=start%substr(%sysfunc(compress(%sysfunc(uuidgen()),-)),1,27);

/* START */
%let dttm=%sysfunc(datetime());

filename &inref &infile lrecl=1 recfm=n;

data &ds1;
  infile &inref;
  input sourcechar $char1. @@;
  format sourcechar hex2.;
run;

data &ds2;
  /* set find string to length in bytes to cover trailing spaces */
  length string $ %length(%superq(&findvar));
  string =symget("&findvar");
  drop string;

  firstchar=char(string,1);
  findlen=lengthm(string); /* <- for trailing bytes */

  do _N_=1 to nobs;
    set &ds1 nobs=nobs point=_N_;
    if sourcechar=firstchar then do;
      pos=1;
      s=0;
      do point=_N_ to min(_N_ + findlen -1,nobs);
        set &ds1 point=point;
        if sourcechar=char(string, pos) then s + 1;
        else goto _leave_;
        pos+1;
      end;
      _leave_:
      if s=findlen then do;
        START =_N_;
        _N_ =_N_+ s - 1;
        STOP =_N_;
        output;
      end;
    end;
  end;
  stop;
  keep START STOP;
run;

data &ds1;
  declare hash HS(dataset:"&ds2(keep=start)");
  HS.defineKey("start");
  HS.defineDone();
  declare hash HE(dataset:"&ds2(keep=stop)");
  HE.defineKey("stop");
  HE.defineDone();
  do until(eof);
    set &ds1 end=eof curobs =n;
    start = ^HS.check(key:n);
    stop  = ^HE.check(key:n);
    length strt $ 1;
    strt =put(start,best. -L);
    retain out 1;
    if out   then output;
    if start then out=0;
    if stop  then out=1;
  end;
  stop;
  keep sourcechar strt;
run;

filename &outref &outfile recfm=n;

data _null_;
  length replace $ %length(%superq(&replacevar));
  replace=symget("&replacevar");
  file &outref;
  do until(eof);
    set &ds1 end=eof;
    if strt ="1" then put replace char.;
    else put sourcechar char1.;
  end;
  stop;
run;

/* END */
%put &sysmacroname took %sysevalf(%sysfunc(datetime())-&dttm) seconds to run;

%mend mp_replace;

%macro sasjsout(type,fref=sasjs);
%global sysprocessmode SYS_JES_JOB_URI;
%if "&sysprocessmode"="SAS Compute Server" %then %do;
  %if &type=HTML %then %do;
    filename _webout filesrvc parenturi="&SYS_JES_JOB_URI" name="_webout.json"
      contenttype="text/html";
  %end;
  %else %if &type=JS or &type=JS64 %then %do;
    filename _webout filesrvc parenturi="&SYS_JES_JOB_URI" name='_webout.js'
      contenttype='application/javascript';
  %end;
  %else %if &type=CSS or &type=CSS64 %then %do;
    filename _webout filesrvc parenturi="&SYS_JES_JOB_URI" name='_webout.css'
      contenttype='text/css';
  %end;
  %else %if &type=PNG or &type=GIF or &type=JPEG or &type=JPG %then %do;
    filename _webout filesrvc parenturi="&SYS_JES_JOB_URI"
      name="_webout.%lowcase(&type)"
      contenttype="image/%lowcase(&type)" lrecl=2000000 recfm=n;
  %end;
  %else %if &type=SVG or &type=SVG64 %then %do;
    filename _webout filesrvc parenturi="&SYS_JES_JOB_URI"
      name="_webout.svg"
      contenttype="image/svg+xml" lrecl=2000000 recfm=n;
  %end;
  %else %if &type=ICO %then %do;
    filename _webout filesrvc parenturi="&SYS_JES_JOB_URI" name='_webout.ico'
      contenttype='image/vnd.microsoft.icon' lrecl=2000000 recfm=n;
  %end;
  %else %if &type=JSON %then %do;
    filename _webout filesrvc parenturi="&SYS_JES_JOB_URI" name='_webout.json'
      contenttype='application/json' lrecl=2000000 recfm=n;
  %end;
  %else %if &type=MP3 %then %do;
    filename _webout filesrvc parenturi="&SYS_JES_JOB_URI" name='_webout.mp3'
      contenttype='audio/mpeg' lrecl=2000000 recfm=n;
  %end;
  %else %if &type=WAV %then %do;
    filename _webout filesrvc parenturi="&SYS_JES_JOB_URI" name='_webout.wav'
      contenttype='audio/x-wav' lrecl=2000000 recfm=n;
  %end;
  %else %if &type=OGG %then %do;
    filename _webout filesrvc parenturi="&SYS_JES_JOB_URI" name='_webout.ogg'
      contenttype='audio/ogg' lrecl=2000000 recfm=n;
  %end;
  %else %if &type=WOFF or &type=WOFF2 or &type=TTF %then %do;
    filename _webout filesrvc parenturi="&SYS_JES_JOB_URI"
      contenttype="font/%lowcase(&type)";
  %end;
  %else %if &type=MP4 %then %do;
    filename _webout filesrvc parenturi="&SYS_JES_JOB_URI"
      contenttype="video/mp4";
  %end;
%end;
%else %do;
  %if &type=JS or &type=JS64 %then %do;
    %let rc=%sysfunc(stpsrv_header(
      Content-type,application/javascript%str(;)charset=UTF-8
    ));
  %end;
  %else %if &type=CSS or &type=CSS64 %then %do;
    %let rc=%sysfunc(stpsrv_header(Content-type,text/css));
  %end;
  %else %if &type=PNG or &type=GIF or &type=JPEG or &type=JPG %then %do;
    %let rc=%sysfunc(stpsrv_header(Content-type,image/%lowcase(&type)));
  %end;
  %else %if &type=SVG or &type=SVG64 %then %do;
    %let rc=%sysfunc(stpsrv_header(Content-type,image/svg+xml));
  %end;
  %else %if &type=ICO %then %do;
    %let rc=%sysfunc(stpsrv_header(Content-type,image/vnd.microsoft.icon));
  %end;
  %else %if &type=JSON %then %do;
    %let rc=%sysfunc(stpsrv_header(Content-type,application/json));
  %end;
  %else %if &type=MP3 %then %do;
    %let rc=%sysfunc(stpsrv_header(Content-type,audio/mpeg));
  %end;
  %else %if &type=WAV %then %do;
    %let rc=%sysfunc(stpsrv_header(Content-type,audio/x-wav));
  %end;
  %else %if &type=OGG %then %do;
    %let rc=%sysfunc(stpsrv_header(Content-type,audio/ogg));
  %end;
  %else %if &type=WOFF or &type=WOFF2 or &type=TTF %then %do;
    %let rc=%sysfunc(stpsrv_header(Content-type,font/%lowcase(&type)));
  %end;
  %else %if &type=MP4 %then %do;
    %let rc=%sysfunc(stpsrv_header(Content-type,video/mp4));
  %end;
%end;
%if &type=HTML %then %do;
  /*
  We need to perform some substitutions -eg to get the APPLOC and SERVERTYPE.
  Therefore the developer should avoid writing lines that exceed 32k
  characters (eg base64 encoded images) as they will get truncated when passing
  through the datastep.  This could of course be re-written using LUA, removing
  the length restriction.  Pull requests are welcome!
  */
  filename _sjsout temp;
  data _null_;
    file _sjsout lrecl=32767 encoding='utf-8';
    infile &fref lrecl=32767;
    input;
    length appLoc expanded_path $1048;
    if _n_=1 then do;
      retain pgm "&_program" appLoc expanded_path;
      /* index is deployed in the /services/ folder under the appLoc */
      appLoc=substr(pgm,1,find(pgm,'/services/')-1);
      expanded_path=cats('?_PROGRAM=',appLoc,'/services/');
    end;
    if find(_infile_,' appLoc: ') then put '    appLoc: ' apploc:$quote1048. ',';
    else if find(_infile_,' serverType: ') then do;
      if symexist('_metaperson') then put '    serverType: "SAS9" ,';
      else put '    serverType: "SASVIYA" ,';
    end;
    else if find(_infile_,' serverUrl: ') then do;
      /* nothing - we are streaming, so remove to default as hostname */
    end;
    else do;
      /* More recently, SASjs apps avoid inline JS to allow strict CSP */
      length infile in1 in2 $32767;
      infile=cats(_infile_);
      spos1=index(upcase(infile),'APPLOC="');
      if spos1>0 then do;
        in1=substr(infile,1,spos1+7);
        in2=subpad(infile,spos1+8);
        in2=substr(in2,index(in2,'"'));
        infile=cats(in1,appLoc,in2);
        putlog "new apploc:  " infile=;
      end;
      /* find & replace serverType in HTML attributes */
      spos2=index(upcase(infile),'SERVERTYPE="');
      if spos2>0 then do;
        in1=substr(infile,1,spos2+11);
        in2=subpad(infile,spos2+12);
        in2=substr(in2,index(in2,'"'));
        if symexist('sasjsprocessmode') then infile=cats(in1,"SASJS",in2);
        else if "&sysprocessmode"="SAS Object Server"
        or "&sysprocessmode"= "SAS Compute Server"
        then infile=cats(in1,"SASVIYA",in2);
        else infile=cats(in1,"SAS9",in2);
        putlog "new servertype:  " infile=;
      end;
      /* find & replace serverUrl in HTML attributes */
      spos3=index(upcase(infile),'SERVERURL="');
      if spos3>0 then do;
        in1=substr(infile,1,spos3+10);
        in2=subpad(infile,spos3+11);
        in2=substr(in2,index(in2,'"'));
        infile=cats(in1,in2);
        putlog "new serverUrl:  " infile=;
      end;
      if sum(spos1,spos2,spos3)>0 then put infile;
      else do;
        /* during SAS9 sasjs compile, dependencies get static GUID */
        infile=tranwrd(_infile_,'?_PROGRAM=${process.sasjsConstants.sas9GUID}',cats(expanded_path));
        put infile;
      end;
    end;
  run;
  %let fref=_sjsout;
%end;
%else %if &type=JS64 or &type=CSS64 %then %do;
  options nobomfile;
  %let fvar=${process.sasjsConstants.sas9GUID};
  %let stgfile="%sysfunc(pathname(work))/stgfile.txt";
  %let newfile="%sysfunc(pathname(work))/newfile.txt";

  /* convert from base64 */
  filename _out64 &stgfile encoding='utf-8';
  data _null_;
    length filein 8 fileout 8;
    filein = fopen("&fref",'I',4,'B');
    fileout = fopen("_out64",'A',1,'B');
    char= '20'x;
    do while(fread(filein)=0);
      length raw $4 ;
      do i=1 to 4;
        rc=fget(filein,char,1);
        substr(raw,i,1)=char;
      end;
      rc = fput(fileout, input(raw,$base64X4.));
      rc =fwrite(fileout);
    end;
    rc = fclose(filein);
    rc = fclose(fileout);
  run;

  /* get appLoc from _program */
  data _null_;
    pgm="&_program";
    appLoc=substr(pgm,1,find(pgm,'/services/')-1);
    call symputx('apploc',cats(appLoc,'/services/'));
  run;
  %put &=fvar;
  %put &=apploc;
  /* replace the GUID with appLoc */
  %mp_replace(&stgfile,
    findvar=fvar,
    replacevar=apploc,
    outfile=&newfile
  )
  filename &fref &newfile encoding='utf-8';
%end;


/**
  * In SAS9, JS & CSS files are base64 encoded to avoid UTF8 issues in WLATIN1
  * metadata - so in this case, decode and stream byte by byte.
  * */
%if &type=GIF or &type=PNG or &type=JPG or &type=JPEG or &type=ICO or &type=MP3
or &type=WAV or &type=OGG or &type=WOFF or &type=WOFF2 or &type=TTF or &type=MP4
or &type=SVG64
%then %do;
  data _null_;
    length filein 8 fileout 8;
    filein = fopen("&fref",'I',4,'B');
    fileout = fopen("_webout",'A',1,'B');
    char = '20'x;
    do while(fread(filein)=0);
      length raw $4 ;
      do i=1 to 4;
        rc=fget(filein,char,1);
        substr(raw,i,1)=char;
      end;
      rc = fput(fileout, input(raw,$base64X4.));
      rc = fwrite(fileout);
    end;
    rc = fclose(filein);
    rc = fclose(fileout);
  run;
%end;
%else %do;
  %put streaming to _webout;
  data _null_;
    infile &fref lrecl=1 recfm=n;
    file _webout mod lrecl=1 recfm=n;
    input sourcechar $char1. @@;
    format sourcechar hex2.;
    put sourcechar char1. @@;
  run;
%end;
%mend sasjsout;`
