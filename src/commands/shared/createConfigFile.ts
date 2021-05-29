import path from 'path'

import { getConfiguration } from '../../utils/config'
import { createFile } from '@sasjs/utils/file'

/**
 * Creates a SASjs configuration file.
 * Its name will be of the form 'sasjsconfig.json'
 * @param {string} parentFolderName- the name of the project folder.
 */
export const createConfigFile = async (parentFolderName: string) => {
  const config = await getConfiguration(
    path.join(__dirname, '../../config.json')
  )
  const configDestinationPath = path.join(
    process.projectDir,
    parentFolderName,
    'sasjs',
    'sasjsconfig.json'
  )
  await createFile(configDestinationPath, JSON.stringify(config, null, 2))
}
