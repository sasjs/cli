import path from 'path'

import {
  setupNpmProject,
  setupGhooks,
  setupGitIgnore,
  setupDoxygen,
  createReactApp,
  createAngularApp,
  createMinimalApp,
  createTemplateApp
} from '../../utils/utils'

import { createFolder } from '../../utils/file'
import { createReadme } from './internal/createReadme'
import { createFileStructure } from '../shared/createFileStructure'
import { createLintConfigFile } from '../shared/createLintConfigFile'

export async function create(parentFolderName: string, appType: string) {
  process.logger?.info('Creating folders and files...')
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
    await createFileStructure(parentFolderName)
  }

  if (!appType) {
    await setupNpmProject(parentFolderName)
  }
  await setupGitIgnore(parentFolderName)

  await setupGhooks(parentFolderName)

  await setupDoxygen(parentFolderName)

  await createReadme(parentFolderName)

  await createLintConfigFile(parentFolderName)
}
