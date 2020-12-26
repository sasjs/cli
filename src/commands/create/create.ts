import path from 'path'

import {
  setupNpmProject,
  setupGitIgnore,
  asyncForEach,
  createReactApp,
  createAngularApp,
  createMinimalApp,
  createTemplateApp
} from '../../utils/utils'
import { getFolders, getConfiguration } from '../../utils/config-utils'
import {
  createFolderStructure,
  createFolder,
  createFile,
  fileExists
} from '../../utils/file'
import chalk from 'chalk'
import { Folder } from '../../types'

export async function create(parentFolderName: string, appType: string) {
  const configPath = '../../config.json'
  const config = await getConfiguration(path.join(__dirname, configPath))
  const fileStructure = await getFolders()
  console.log(chalk.greenBright('Creating folders and files...'))
  if (parentFolderName !== '.') {
    await createFolder(path.join(process.projectDir, parentFolderName))
  }

  if (appType === 'react') {
    await createReactApp(path.join(process.projectDir, parentFolderName))
  } else if (appType === 'angular') {
    await createAngularApp(path.join(process.projectDir, parentFolderName))
  } else if (appType === 'minimal') {
    await createMinimalApp(path.join(process.projectDir, parentFolderName))
  } else if (appType) {
    await createTemplateApp(
      path.join(process.projectDir, parentFolderName),
      appType
    )
  } else {
    await asyncForEach(fileStructure, async (folder: Folder, index: number) => {
      const pathExists = await fileExists(
        path.join(process.projectDir, parentFolderName, folder.folderName)
      )
      if (pathExists) {
        throw new Error(
          `${chalk.redBright(
            `The folder ${chalk.cyanBright(
              folder.folderName
            )} already exists! Please remove any unnecessary files and try again.`
          )}`
        )
      }
      await createFolderStructure(folder, parentFolderName)
      if (index === 0) {
        const configDestinationPath = path.join(
          process.projectDir,
          parentFolderName,
          folder.folderName,
          'sasjsconfig.json'
        )
        await createFile(configDestinationPath, JSON.stringify(config, null, 1))
      }
    })
  }

  if (!appType) {
    await setupNpmProject(parentFolderName)
  }
  await setupGitIgnore(parentFolderName)
}
