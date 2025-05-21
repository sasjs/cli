import { ServerTypeError } from '@sasjs/utils/error'
import { ServerType } from '@sasjs/utils/types'

const SAS9Code = (streamServiceName: string) => `
options notes;
data _null_;
 format url $256.;
 rc=METADATA_GETURI("Stored Process Web App",url);
 url=coalescec(url,"localhost/SASStoredProcess");
 urlEscaped = tranwrd(trim(url)," ","%20");
 putlog "NOTE: SASjs Streaming App Created! Check it out here:" ;
 putlog "NOTE- ";putlog "NOTE- ";putlog "NOTE- ";putlog "NOTE- ";
 putlog "NOTE- " urlEscaped +(-1) "?_program=&appLoc/services/${streamServiceName}" ;
 putlog "NOTE- ";putlog "NOTE- ";putlog "NOTE- ";putlog "NOTE- ";
run;
`
const SASViyaCode = (streamServiceName: string) => `

/**
  * The streamService we just deployed (as a _FILE) had the compile-time appLoc
  * In this section we replace with the deploy-time appLoc
  */

filename _homein filesrvc
  folderPath="&apploc/services"
  filename="${streamServiceName}.html"
  recfm=v
  lrecl=1048544;

%let local_file=%sysfunc(pathname(work))/service.html;
filename _homeout "&local_file";

data _null_;
  rc=fcopy('_homein','_homeout');
  put rc=;
run;

%mp_replace(infile="&local_file", findvar=compiled_apploc, replacevar=apploc)

data _null_;
  rc=fcopy('_homeout','_homein');
  put rc=;
run;

/* Tell the user where the app was deployed so they can open it */
options notes;
data _null_;
 if symexist('_baseurl') then do;
   url=symget('_baseurl');
   if subpad(url,length(url)-9,9)='SASStudio'
     then url=substr(url,1,length(url)-11);
   else url="&systcpiphostname";
 end;
 else url="&systcpiphostname";
 url=cats(url,"/SASJobExecution?_FILE=&appLoc/services/");
 urlEscaped = tranwrd(trim(url)," ","%20");
 putlog "NOTE: SASjs Streaming App Created! Check it out here:" ;
 putlog "NOTE- ";putlog "NOTE- ";putlog "NOTE- ";putlog "NOTE- ";
 putlog "NOTE- " urlEscaped +(-1) '${streamServiceName}.html' ;
 putlog "NOTE- ";putlog "NOTE- ";putlog "NOTE- ";putlog "NOTE- ";
run;
`

export const getLaunchPageCode = (
  serverType: ServerType,
  streamServiceName: string
): string => {
  switch (serverType) {
    case ServerType.SasViya:
      return SASViyaCode(streamServiceName)

    case ServerType.Sas9:
      return SAS9Code(streamServiceName)

    default:
      throw new ServerTypeError([ServerType.SasViya, ServerType.Sas9])
  }
}
