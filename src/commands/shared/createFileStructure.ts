import path from 'path'

import { asyncForEach } from '../../utils/utils'
import { getFolders } from '../../utils/config'
import { createFolderStructure, fileExists } from '../../utils/file'
import { Folder } from '../../types'

import { createConfigFile } from './createConfigFile'

/**
 * Creates the folder structure specified in config.json
 * Also creates a SASjs configation file, named 'sasjsconfig.json'.
 * @param {string} parentFolderName- the name of the project folder.
 */
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
