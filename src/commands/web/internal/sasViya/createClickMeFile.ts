import { createFile } from '@sasjs/utils'
import path from 'path'

/**
 * Creates index file for SASVIYA server only.
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
