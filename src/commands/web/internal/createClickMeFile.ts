import { createFile } from '@sasjs/utils'
import path from 'path'

/**
 * Creates the entry page of a streamed app: the copy of index.html whose asset
 * links point at the server's file routes.
 *
 * It lands at the root of the services folder, beside the folder holding the
 * assets, so the address a caller opens is `<services>/<name>.html` on every
 * server that streams a file by name - SAS Viya and SASjs server alike. SAS 9
 * has no such route and gets a stored process instead (see `sas9`).
 * @param {string} indexHtmlContent contents of index file.
 * @param {string} fileName name of index file.
 */
export const createClickMeFile = async (
  indexHtmlContent: string,
  fileName: string
) => {
  const { buildDestinationServicesFolder } = process.sasjsConstants
  await createFile(
    path.join(buildDestinationServicesFolder, `${fileName}.html`),
    indexHtmlContent
  )
}
