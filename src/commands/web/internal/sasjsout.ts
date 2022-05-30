export const sasjsout = `
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
  filename _sjs temp;
  data _null_;
    file _sjs lrecl=32767 encoding='utf-8';
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
        /* during SAS9 sasjs compile, dependencies get three slashes /// */
        infile=tranwrd(_infile_,'?_PROGRAM=///',cats(expanded_path));
        put infile;
      end;
    end;
  run;
  %let fref=_sjs;
%end;

/**
  * In SAS9, JS & CSS files are base64 encoded to avoid UTF8 issues in WLATIN1
  * metadata - so in this case, decode and stream byte by byte.
  * */
%if &type=GIF or &type=PNG or &type=JPG or &type=JPEG or &type=ICO or &type=MP3
or &type=JS64 or &type=CSS64 or &type=WAV or &type=OGG or &type=WOFF
or &type=WOFF2 or &type=TTF or &type=MP4
%then %do;
  data _null_;
    length filein 8 fileout 8;
    filein = fopen("&fref",'I',4,'B');
    fileout = fopen("_webout",'A',1,'B');
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
