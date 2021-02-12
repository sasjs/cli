import path from 'path'

import { asyncForEach } from '../../utils/utils'
import { getFolders, getConfiguration } from '../../utils/config'
import {
  createFolderStructure,
  createFolder,
  createFile,
  fileExists
} from '../../utils/file'
import { Folder } from '../../types'

const createConfigFile = async (parentFolderName: string) => {
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
export const createFileStructure = async (parentFolderName: string) => {
  const fileStructure = await getFolders()
  await asyncForEach(fileStructure, async (folder: Folder, index: number) => {
    const pathExists = await fileExists(
      path.join(process.projectDir, parentFolderName, folder.folderName)
    )
    if (pathExists) {
      throw new Error(
        `The folder ${folder.folderName} already exists! Please remove any unnecessary files and try again.`
      )
    }
    await createFolderStructure(folder, parentFolderName)
    if (index === 0) {
      await createConfigFile(parentFolderName)
    }
  })
}
