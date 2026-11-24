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
 putlog "NOTE- " urlEscaped +(-1) "?_program=&appLoc/${streamServiceName}" ;
 putlog "NOTE- ";putlog "NOTE- ";putlog "NOTE- ";putlog "NOTE- ";
run;
`

/**
 * Where a streamed app is opened, on a server that reads a deployment file by
 * name.
 *
 * `_FILE=` names the entry page one level above the folder holding the assets,
 * and the two servers that stream this way answer it at different paths: SAS
 * Viya at the job execution route, SASjs server at its own Drive API. The
 * address is built from `&appLoc`, so the same build opened at a different
 * appLoc reports the address it actually landed on.
 */
const fileStreamCode = (filePath: string, streamServiceName: string) => `
/* Tell the user where the app was deployed so they can open it */
options notes;
data _null_;
 if symexist('_baseurl') then do;
   url=symget('_baseurl');
   if subpad(url,length(url)-8,9)='SASStudio'
     then url=substr(url,1,length(url)-10);
   else url="&systcpiphostname";
 end;
 else url="&systcpiphostname";
 url=cats(url,"${filePath}&appLoc/");
 urlEscaped = tranwrd(trim(url)," ","%20");
 putlog "NOTE: SASjs Streaming App Created! Check it out here:" ;
 putlog "NOTE- ";putlog "NOTE- ";putlog "NOTE- ";putlog "NOTE- ";
 putlog "NOTE- " urlEscaped +(-1) '${streamServiceName}.html' ;
 putlog "NOTE- ";putlog "NOTE- ";putlog "NOTE- ";putlog "NOTE- ";
run;
`

const SASViyaCode = (streamServiceName: string) =>
  fileStreamCode('/SASJobExecution?_FILE=', streamServiceName)

const SASjsCode = (streamServiceName: string) =>
  fileStreamCode('/StoredProgram?_FILE=', streamServiceName)

export const getLaunchPageCode = (
  serverType: ServerType,
  streamServiceName: string
): string => {
  switch (serverType) {
    case ServerType.SasViya:
      return SASViyaCode(streamServiceName)

    case ServerType.Sasjs:
      return SASjsCode(streamServiceName)

    case ServerType.Sas9:
      return SAS9Code(streamServiceName)

    default:
      throw new ServerTypeError([
        ServerType.SasViya,
        ServerType.Sasjs,
        ServerType.Sas9
      ])
  }
}
