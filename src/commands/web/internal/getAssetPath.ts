import { ServerType } from '@sasjs/utils'

/**
 * The address one streamed asset is fetched from, per server type.
 *
 * Each server type has a web tier the browser talks to - `/SASStoredProcess` on
 * SAS 9, `/SASJobExecution` on Viya - and each reads one file through a query
 * parameter naming its location. SASjs server's own tier is `/StoredProgram`,
 * and it answers both `_FILE=` (ours) and the estate's spelling, so a build made
 * for an estate opens here unchanged.
 */
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
    // for Viya and SASjs server, fileName is a FILE at the build appLoc, so
    //   the value is baked in - exactly as it is for Viya
    serverType === ServerType.SasViya
      ? `/SASJobExecution?_FILE=${appLoc}/services`
      : serverType === ServerType.Sasjs
        ? `/StoredProgram?_FILE=${appLoc}/services`
        : `/SASStoredProcess/?_PROGRAM=${sas9GUID}`
  return `${storedProcessPath}/${streamWebFolder}/${fileName}`
}
