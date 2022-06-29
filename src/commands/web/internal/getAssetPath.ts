import { ServerType } from '@sasjs/utils'

export const getAssetPath = (
  appLoc: string,
  serverType: ServerType,
  streamWebFolder: string,
  fileName: string
) => {
  const { sas9GUID } = process.sasjsConstants
  const storedProcessPath =
    // the appLoc is inserted dynamically by SAS
    // using three forward slashes as a marker
    // for SAS 9 fileName is a program, with replacement in sasjsout.ts
    // for Viya, fileName is a FILE, with replacement in build.sas only
    serverType === ServerType.SasViya
      ? `/SASJobExecution?_FILE=${appLoc}/services/${streamWebFolder}`
      : `/SASStoredProcess/?_PROGRAM=${sas9GUID}/${streamWebFolder}`
  return `${storedProcessPath}/${fileName}`
}
