import { ServerType } from '@sasjs/utils/types'

const SAS9Code = (streamServiceName: string) => `
options notes;
data _null_;
 format url $256.; 
 rc=METADATA_GETURI("Stored Process Web App",url);
 url=coalescec(url,"localhost/SASStoredProcess");
 putlog "NOTE: SASjs Streaming App Created!!  Check it out here:" ;
 putlog "NOTE- ";putlog "NOTE- ";putlog "NOTE- ";putlog "NOTE- ";
 putlog "NOTE- " url +(-1) "?_program=&appLoc/services/${streamServiceName}" ;
 putlog "NOTE- ";putlog "NOTE- ";putlog "NOTE- ";putlog "NOTE- ";
run;
`
const SASViyaCode = (streamServiceName: string) => `
options notes;
data _null_;
 if symexist('_baseurl') then do;
   url=symget('_baseurl');
   if subpad(url,length(url)-9,9)='SASStudio'
     then url=substr(url,1,length(url)-11);
   else url="&systcpiphostname";
 end;
 else url="&systcpiphostname";
 url=cats(url,"/SASJobExecution?_PROGRAM=&appLoc/services/");
 putlog "NOTE: SASjs Streaming App Created!!  Check it out here:" ;
 putlog "NOTE- ";putlog "NOTE- ";putlog "NOTE- ";putlog "NOTE- ";
 putlog "NOTE- " url +(-1) "${streamServiceName}" ;
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
      throw new Error(
        `Invalid server type: valid options are ${ServerType.SasViya} and ${ServerType.Sas9}`
      )
  }
}
