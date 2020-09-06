export const sasjsout = `%macro sasjsout(type,fref=sasjs);
%global sysprocessmode SYS_JES_JOB_URI;
%if "&sysprocessmode"="SAS Compute Server" %then %do;
  %if &type=HTML %then %do;
    filename _webout filesrvc parenturi="&SYS_JES_JOB_URI" name="_webout.json"
      contenttype="text/html";
  %end;
  %else %if &type=JS %then %do;
    filename _webout filesrvc parenturi="&SYS_JES_JOB_URI" name='_webout.js'
      contenttype='application/javascript';
  %end;
  %else %if &type=CSS %then %do;
    filename _webout filesrvc parenturi="&SYS_JES_JOB_URI" name='_webout.css'
      contenttype='text/css';
  %end;
  %else %if &type=PNG %then %do;
    filename _webout filesrvc parenturi="&SYS_JES_JOB_URI" name='_webout.png'
      contenttype='image/png' lrecl=2000000 recfm=n;
  %end;
  %else %if &type=JSON %then %do;
    filename _webout filesrvc parenturi="&SYS_JES_JOB_URI" name='_webout.json'
      contenttype='application/json' lrecl=2000000 recfm=n;
  %end;
  %else %if &type=MP3 %then %do;
    filename _webout filesrvc parenturi="&SYS_JES_JOB_URI" name='_webout.mp3'
      contenttype='audio/mpeg' lrecl=2000000 recfm=n;
  %end;
%end;
%else %do;
  %if &type=JS %then %do;
    %let rc=%sysfunc(stpsrv_header(Content-type,application/javascript));
  %end;
  %else %if &type=CSS %then %do;
    %let rc=%sysfunc(stpsrv_header(Content-type,text/css));
  %end;
  %else %if &type=PNG %then %do;
    %let rc=%sysfunc(stpsrv_header(Content-type,image/png));
  %end;
  %else %if &type=JSON %then %do;
    %let rc=%sysfunc(stpsrv_header(Content-type,application/json));
  %end;
  %else %if &type=MP3 %then %do;
    %let rc=%sysfunc(stpsrv_header(Content-type,audio/mpeg));
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
  filename _sjs temp;
  data _null_; 
    file _sjs lrecl=32767 encoding='utf-8';
    infile &fref lrecl=32767;
    input;
    if find(_infile_,' appLoc: ') then do;
      pgm="&_program";
      rootlen=length(trim(pgm))-length(scan(pgm,-1,'/'))-1;
      root=quote(substr(pgm,1,rootlen));
      put '    appLoc: ' root ',';
    end;
    else if find(_infile_,' serverType: ') then do;
      if symexist('_metaperson') then put '    serverType: "SAS9" ,';
      else put '    serverType: "SASVIYA" ,';
    end;
    else if find(_infile_,' hostUrl: ') then do;
      /* nothing - we are streaming so this will default to hostname */
    end;
    else put _infile_;
  run;
  %let fref=_sjs;
%end;

/* stream byte by byte */
%if &type=PNG or &type=MP3 %then %do;
  data _null_;
    length filein 8 fileout 8;
    filein = fopen("&fref",'I',4,'B');
    fileout = fopen("_webout",'A',1,'B');
    char= '20'x;
    do while(fread(filein)=0);
      raw="1234";
      do i=1 to 4;
        rc=fget(filein,char,1);
        substr(raw,i,1)=char;
      end;
      val="123";
      val=input(raw,$base64X4.);
      do i=1 to 3;
        length byte $1;
        byte=byte(rank(substr(val,i,1)));
        rc = fput(fileout, byte);
      end;
      rc =fwrite(fileout);
    end;
    rc = fclose(filein);
    rc = fclose(fileout);
  run;
%end;
%else %do;
  data _null_;
    length filein 8 fileid 8;
    filein = fopen("&fref",'I',1,'B');
    fileid = fopen("_webout",'A',1,'B');
    rec = '20'x;
    do while(fread(filein)=0);
      rc = fget(filein,rec,1);
      rc = fput(fileid, rec);
      rc =fwrite(fileid);
    end;
    rc = fclose(filein);
    rc = fclose(fileid);
  run;
%end;
%mend;`
