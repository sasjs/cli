import path from 'path'
import { base64EncodeFile, createFile } from '@sasjs/utils'
import { getWebServiceContent } from './'

/**
 * Creates service file for SAS9 server only.
 * @param {string} sourcePath path of source file.
 * @param {string} destinationPath path of destination service file.
 * @returns {string} name of created service file.
 */
export const generateAssetService = async (
  sourcePath: string,
  destinationPath: string
): Promise<string> => {
  const fileExtension = path.extname(sourcePath)
  const fileType = fileExtension.replace('.', '').toUpperCase()
  const fileName = path
    .basename(sourcePath)
    .replace(new RegExp(fileExtension + '$'), fileExtension.replace('.', '-'))
  const base64string = await base64EncodeFile(sourcePath)

  const serviceContent = await getWebServiceContent(base64string, fileType)

  await createFile(
    path.join(destinationPath, `${fileName}.sas`),
    serviceContent
  )

  return `${fileName}.sas`
}
