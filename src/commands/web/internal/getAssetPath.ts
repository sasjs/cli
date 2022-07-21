import { ServerType } from '@sasjs/utils'

export const getAssetPath = (
  appLoc: string,
  serverType: ServerType,
  streamWebFolder: string,
  fileName: string
) => {
  const { sas9GUID } = process.sasjsConstants
  const storedProcessPath =
    // the appLoc is inserted dynamically
    // for SAS 9 files are Base 64 encoded into STPs, with
    //   dynamic runtime replacement of appLoc (see sasjsout.ts)
    // for Viya, fileName is a FILE, with replacement harcoded in build.sas
    serverType === ServerType.SasViya
      ? `/SASJobExecution?_FILE=${appLoc}/services`
      : `/SASStoredProcess/?_PROGRAM=${sas9GUID}`
  return `${storedProcessPath}/${streamWebFolder}/${fileName}`
}
