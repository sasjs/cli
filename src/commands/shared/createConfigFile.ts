import path from 'path'

import { getConfiguration } from '../../utils/config'
import { createFile } from '../../utils/file'

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
  await createFile(configDestinationPath, JSON.stringify(config, null, 1))
}
