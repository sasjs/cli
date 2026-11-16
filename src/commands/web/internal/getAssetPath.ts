import { ServerType } from '@sasjs/utils'

/**
 * The address one streamed asset is fetched from, per server type.
 *
 * Viya and SASjs server answer the same idea under different names: a file in
 * the deployment folder is read through a query parameter naming its location.
 * Viya's is `/SASJobExecution?_FILE=`, the one a SAS program and a browser both
 * know; SASjs server's is its own API, `/SASjsApi/drive/file?_FILE=`, which the
 * server also answers under the Viya spelling so a build made for one host can
 * be opened on the other.
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
        ? `/SASjsApi/drive/file?_FILE=${appLoc}/services`
        : `/SASStoredProcess/?_PROGRAM=${sas9GUID}`
  return `${storedProcessPath}/${streamWebFolder}/${fileName}`
}
