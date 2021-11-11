 /* Created on  08NOV2021:17:16:34 by mihmed */
 
%macro mp_jsonout(action,ds,jref=_webout,dslabel=,fmt=Y,engine=DATASTEP,dbg=0 
)/*/STORE SOURCE*/; 
%put output location=&jref; 
%if &action=OPEN %then %do; 
  options nobomfile; 
  data _null_;file &jref encoding='utf-8'; 
    put '{"START_DTTM" : "' "%sysfunc(datetime(),datetime20.3)" '"'; 
  run; 
%end; 
%else %if (&action=ARR or &action=OBJ) %then %do; 
  options validvarname=upcase; 
  data _null_;file &jref mod encoding='utf-8'; 
    put ", ""%lowcase(%sysfunc(coalescec(&dslabel,&ds)))"":"; 
 
  %if &engine=PROCJSON %then %do; 
    data;run;%let tempds=&syslast; 
    proc sql;drop table &tempds; 
    data &tempds /view=&tempds;set &ds; 
    %if &fmt=N %then format _numeric_ best32.;; 
    proc json out=&jref pretty 
        %if &action=ARR %then nokeys ; 
        ;export &tempds / nosastags fmtnumeric; 
    run; 
    proc sql;drop view &tempds; 
  %end; 
  %else %if &engine=DATASTEP %then %do; 
    %local cols i tempds; 
    %let cols=0; 
    %if %sysfunc(exist(&ds)) ne 1 & %sysfunc(exist(&ds,VIEW)) ne 1 %then %do; 
      %put &sysmacroname:  &ds NOT FOUND!!!; 
      %return; 
    %end; 
    %if &fmt=Y %then %do; 
      %put converting every variable to a formatted variable; 
      /* see mp_ds2fmtds.sas for source */ 
      proc contents noprint data=&ds 
        out=_data_(keep=name type length format formatl formatd varnum); 
      run; 
      proc sort; 
        by varnum; 
      run; 
      %local fmtds; 
      %let fmtds=%scan(&syslast,2,.); 
      /* prepare formats and varnames */ 
      data _null_; 
        if _n_=1 then call symputx('nobs',nobs,'l'); 
        set &fmtds end=last nobs=nobs; 
        name=upcase(name); 
        /* fix formats */ 
        if type=2 or type=6 then do; 
          length fmt $49.; 
          if format='' then fmt=cats('$',length,'.'); 
          else if formatl=0 then fmt=cats(format,'.'); 
          else fmt=cats(format,formatl,'.'); 
          newlen=max(formatl,length); 
        end; 
        else do; 
          if format='' then fmt='best.'; 
          else if formatl=0 then fmt=cats(format,'.'); 
          else if formatd=0 then fmt=cats(format,formatl,'.'); 
          else fmt=cats(format,formatl,'.',formatd); 
          /* needs to be wide, for datetimes etc */ 
          newlen=max(length,formatl,24); 
        end; 
        /* 32 char unique name */ 
        newname='sasjs'!!substr(cats(put(md5(name),$hex32.)),1,27); 
 
        call symputx(cats('name',_n_),name,'l'); 
        call symputx(cats('newname',_n_),newname,'l'); 
        call symputx(cats('len',_n_),newlen,'l'); 
        call symputx(cats('fmt',_n_),fmt,'l'); 
        call symputx(cats('type',_n_),type,'l'); 
      run; 
      data &fmtds; 
        /* rename on entry */ 
        set &ds(rename=( 
      %local i; 
      %do i=1 %to &nobs; 
        &&name&i=&&newname&i 
      %end; 
        )); 
      %do i=1 %to &nobs; 
        length &&name&i $&&len&i; 
        &&name&i=left(put(&&newname&i,&&fmt&i)); 
        drop &&newname&i; 
      %end; 
        if _error_ then call symputx('syscc',1012); 
      run; 
      %let ds=&fmtds; 
    %end; /* &fmt=Y */ 
    data _null_;file &jref mod encoding='utf-8'; 
      put "["; call symputx('cols',0,'l'); 
    proc sort 
      data=sashelp.vcolumn(where=(libname='WORK' & memname="%upcase(&ds)")) 
      out=_data_; 
      by varnum; 
 
    data _null_; 
      set _last_ end=last; 
      call symputx(cats('name',_n_),name,'l'); 
      call symputx(cats('type',_n_),type,'l'); 
      call symputx(cats('len',_n_),length,'l'); 
      if last then call symputx('cols',_n_,'l'); 
    run; 
 
    proc format; /* credit yabwon for special null removal */ 
      value bart ._ - .z = null 
      other = [best.]; 
 
    data;run; %let tempds=&syslast; /* temp table for spesh char management */ 
    proc sql; drop table &tempds; 
    data &tempds/view=&tempds; 
      attrib _all_ label=''; 
      %do i=1 %to &cols; 
        %if &&type&i=char %then %do; 
          length &&name&i $32767; 
          format &&name&i $32767.; 
        %end; 
      %end; 
      set &ds; 
      format _numeric_ bart.; 
    %do i=1 %to &cols; 
      %if &&type&i=char %then %do; 
        &&name&i='"'!!trim(prxchange('s/"/\"/',-1, 
                    prxchange('s/'!!'0A'x!!'/\n/',-1, 
                    prxchange('s/'!!'0D'x!!'/\r/',-1, 
                    prxchange('s/'!!'09'x!!'/\t/',-1, 
                    prxchange('s/\\/\\\\/',-1,&&name&i) 
        )))))!!'"'; 
      %end; 
    %end; 
    run; 
    /* write to temp loc to avoid _webout truncation 
      - https://support.sas.com/kb/49/325.html */ 
    filename _sjs temp lrecl=131068 encoding='utf-8'; 
    data _null_; file _sjs lrecl=131068 encoding='utf-8' mod; 
      set &tempds; 
      if _n_>1 then put "," @; put 
      %if &action=ARR %then "[" ; %else "{" ; 
      %do i=1 %to &cols; 
        %if &i>1 %then  "," ; 
        %if &action=OBJ %then """&&name&i"":" ; 
        &&name&i 
      %end; 
      %if &action=ARR %then "]" ; %else "}" ; ; 
    proc sql; 
    drop view &tempds; 
    /* now write the long strings to _webout 1 byte at a time */ 
    data _null_; 
      length filein 8 fileid 8; 
      filein = fopen("_sjs",'I',1,'B'); 
      fileid = fopen("&jref",'A',1,'B'); 
      rec = '20'x; 
      do while(fread(filein)=0); 
        rc = fget(filein,rec,1); 
        rc = fput(fileid, rec); 
        rc =fwrite(fileid); 
      end; 
      rc = fclose(filein); 
      rc = fclose(fileid); 
    run; 
    filename _sjs clear; 
    data _null_; file &jref mod encoding='utf-8'; 
      put "]"; 
    run; 
  %end; 
%end; 
 
%else %if &action=CLOSE %then %do; 
  data _null_;file &jref encoding='utf-8' mod; 
    put "}"; 
  run; 
%end; 
%mend mp_jsonout; 
%macro mv_webout(action,ds,fref=_mvwtemp,dslabel=,fmt=Y,stream=Y); 
%global _webin_file_count _webin_fileuri _debug _omittextlog _webin_name 
  sasjs_tables SYS_JES_JOB_URI; 
%if %index("&_debug",log) %then %let _debug=131; 
 
%local i tempds; 
%let action=%upcase(&action); 
 
%if &action=FETCH %then %do; 
  %if %upcase(&_omittextlog)=FALSE or %str(&_debug) ge 131 %then %do; 
    options mprint notes mprintnest; 
  %end; 
 
  %if not %symexist(_webin_fileuri1) %then %do; 
    %let _webin_file_count=%eval(&_webin_file_count+0); 
    %let _webin_fileuri1=&_webin_fileuri; 
    %let _webin_name1=&_webin_name; 
  %end; 
 
  /* if the sasjs_tables param is passed, we expect param based upload */ 
  %if %length(&sasjs_tables.XX)>2 %then %do; 
    filename _sasjs "%sysfunc(pathname(work))/sasjs.lua"; 
    data _null_; 
      file _sasjs; 
      put 's=sas.symget("sasjs_tables")'; 
      put 'if(s:sub(1,7) == "%nrstr(")'; 
      put 'then'; 
      put ' tablist=s:sub(8,s:len()-1)'; 
      put 'else'; 
      put ' tablist=s'; 
      put 'end'; 
      put 'for i = 1,sas.countw(tablist) '; 
      put 'do '; 
      put '  tab=sas.scan(tablist,i)'; 
      put '  sasdata=""'; 
      put '  if (sas.symexist("sasjs"..i.."data0")==0)'; 
      put '  then'; 
      /* TODO - condense this logic */ 
      put '    s=sas.symget("sasjs"..i.."data")'; 
      put '    if(s:sub(1,7) == "%nrstr(")'; 
      put '    then'; 
      put '      sasdata=s:sub(8,s:len()-1)'; 
      put '    else'; 
      put '      sasdata=s'; 
      put '    end'; 
      put '  else'; 
      put '    for d = 1, sas.symget("sasjs"..i.."data0")'; 
      put '    do'; 
      put '      s=sas.symget("sasjs"..i.."data"..d)'; 
      put '      if(s:sub(1,7) == "%nrstr(")'; 
      put '      then'; 
      put '        sasdata=sasdata..s:sub(8,s:len()-1)'; 
      put '      else'; 
      put '        sasdata=sasdata..s'; 
      put '      end'; 
      put '    end'; 
      put '  end'; 
      put '  file = io.open(sas.pathname("work").."/"..tab..".csv", "a")'; 
      put '  io.output(file)'; 
      put '  io.write(sasdata)'; 
      put '  io.close(file)'; 
      put 'end'; 
    run; 
    %inc _sasjs; 
 
    /* now read in the data */ 
    %do i=1 %to %sysfunc(countw(&sasjs_tables)); 
      %local table; %let table=%scan(&sasjs_tables,&i); 
      data _null_; 
        infile "%sysfunc(pathname(work))/&table..csv" termstr=crlf ; 
        input; 
        if _n_=1 then call symputx('input_statement',_infile_); 
        list; 
      data &table; 
        infile "%sysfunc(pathname(work))/&table..csv" firstobs=2 dsd 
          termstr=crlf; 
        input &input_statement; 
      run; 
    %end; 
  %end; 
  %else %do i=1 %to &_webin_file_count; 
    /* read in any files that are sent */ 
    /* this part needs refactoring for wide files */ 
    filename indata filesrvc "&&_webin_fileuri&i" lrecl=999999; 
    data _null_; 
      infile indata termstr=crlf lrecl=32767; 
      input; 
      if _n_=1 then call symputx('input_statement',_infile_); 
      %if %str(&_debug) ge 131 %then %do; 
        if _n_<20 then putlog _infile_; 
        else stop; 
      %end; 
      %else %do; 
        stop; 
      %end; 
    run; 
    data &&_webin_name&i; 
      infile indata firstobs=2 dsd termstr=crlf ; 
      input &input_statement; 
    run; 
    %let sasjs_tables=&sasjs_tables &&_webin_name&i; 
  %end; 
%end; 
%else %if &action=OPEN %then %do; 
  /* setup webout */ 
  OPTIONS NOBOMFILE; 
  %if "X&SYS_JES_JOB_URI.X"="XX" %then %do; 
    filename _webout temp lrecl=999999 mod; 
  %end; 
  %else %do; 
    filename _webout filesrvc parenturi="&SYS_JES_JOB_URI" 
      name="_webout.json" lrecl=999999 mod; 
  %end; 
 
  /* setup temp ref */ 
  %if %upcase(&fref) ne _WEBOUT %then %do; 
    filename &fref temp lrecl=999999 permission='A::u::rwx,A::g::rw-,A::o::---' 
      mod; 
  %end; 
 
  /* setup json */ 
  data _null_;file &fref; 
    put '{"START_DTTM" : "' "%sysfunc(datetime(),datetime20.3)" '"'; 
  run; 
%end; 
%else %if &action=ARR or &action=OBJ %then %do; 
    %mp_jsonout(&action,&ds,dslabel=&dslabel,fmt=&fmt 
      ,jref=&fref,engine=DATASTEP,dbg=%str(&_debug) 
    ) 
%end; 
%else %if &action=CLOSE %then %do; 
  %if %str(&_debug) ge 131 %then %do; 
    /* send back first 10 records of each work table for debugging */ 
    options obs=10; 
    data;run;%let tempds=%scan(&syslast,2,.); 
    ods output Members=&tempds; 
    proc datasets library=WORK memtype=data; 
    %local wtcnt;%let wtcnt=0; 
    data _null_; 
      set &tempds; 
      if not (upcase(name) =:"DATA"); /* ignore temp datasets */ 
      i+1; 
      call symputx('wt'!!left(i),name); 
      call symputx('wtcnt',i); 
    data _null_; file &fref mod; put ",""WORK"":{"; 
    %do i=1 %to &wtcnt; 
      %let wt=&&wt&i; 
      proc contents noprint data=&wt 
        out=_data_ (keep=name type length format:); 
      run;%let tempds=%scan(&syslast,2,.); 
      data _null_; file &fref mod; 
        dsid=open("WORK.&wt",'is'); 
        nlobs=attrn(dsid,'NLOBS'); 
        nvars=attrn(dsid,'NVARS'); 
        rc=close(dsid); 
        if &i>1 then put ','@; 
        put " ""&wt"" : {"; 
        put '"nlobs":' nlobs; 
        put ',"nvars":' nvars; 
      %mp_jsonout(OBJ,&tempds,jref=&fref,dslabel=colattrs,engine=DATASTEP) 
      %mp_jsonout(OBJ,&wt,jref=&fref,dslabel=first10rows,engine=DATASTEP) 
      data _null_; file &fref mod;put "}"; 
    %end; 
    data _null_; file &fref mod;put "}";run; 
  %end; 
 
  /* close off json */ 
  data _null_;file &fref mod; 
    _PROGRAM=quote(trim(resolve(symget('_PROGRAM')))); 
    put ",""SYSUSERID"" : ""&sysuserid"" "; 
    put ",""MF_GETUSER"" : ""%mf_getuser()"" "; 
    SYS_JES_JOB_URI=quote(trim(resolve(symget('SYS_JES_JOB_URI')))); 
    put ',"SYS_JES_JOB_URI" : ' SYS_JES_JOB_URI ; 
    put ",""SYSJOBID"" : ""&sysjobid"" "; 
    put ",""_DEBUG"" : ""&_debug"" "; 
    put ',"_PROGRAM" : ' _PROGRAM ; 
    put ",""SYSCC"" : ""&syscc"" "; 
    put ",""SYSERRORTEXT"" : ""&syserrortext"" "; 
    put ",""SYSHOSTNAME"" : ""&syshostname"" "; 
    put ",""SYSSCPL"" : ""&sysscpl"" "; 
    put ",""SYSSITE"" : ""&syssite"" "; 
    sysvlong=quote(trim(symget('sysvlong'))); 
    put ',"SYSVLONG" : ' sysvlong; 
    put ",""SYSWARNINGTEXT"" : ""&syswarningtext"" "; 
    put ',"END_DTTM" : "' "%sysfunc(datetime(),datetime20.3)" '" '; 
    put "}"; 
 
  %if %upcase(&fref) ne _WEBOUT and &stream=Y %then %do; 
    data _null_; rc=fcopy("&fref","_webout");run; 
  %end; 
 
%end; 
 
%mend mv_webout; 
 
%macro mf_getuser(type=META 
)/*/STORE SOURCE*/; 
  %local user metavar; 
  %if &type=OS %then %let metavar=_secureusername; 
  %else %let metavar=_metaperson; 
 
  %if %symexist(SYS_COMPUTE_SESSION_OWNER) %then %let user=&SYS_COMPUTE_SESSION_OWNER; 
  %else %if %symexist(&metavar) %then %do; 
    %if %length(&&&metavar)=0 %then %let user=&sysuserid; 
    /* sometimes SAS will add @domain extension - remove for consistency */ 
    %else %let user=%scan(&&&metavar,1,@); 
  %end; 
  %else %let user=&sysuserid; 
 
  %quote(&user) 
 
%mend mf_getuser; 
/* if calling viya service with _job param, _program will conflict */
/* so it is provided by SASjs instead as __program */
%global __program _program;
%let _program=%sysfunc(coalescec(&__program,&_program));
 
%macro webout(action,ds,dslabel=,fmt=);
  %mv_webout(&action,ds=&ds,dslabel=&dslabel,fmt=&fmt)
%mend;
  %abort;
