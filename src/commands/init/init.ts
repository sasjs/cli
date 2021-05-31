import path from 'path'

import {
  setupNpmProject,
  setupGitIgnore,
  setupGhooks,
  setupDoxygen
} from '../../utils/utils'

import { createFolder, fileExists } from '@sasjs/utils'
import { createConfigFile } from '../shared/createConfigFile'
import { createLintConfigFile } from '../shared/createLintConfigFile'

export async function init() {
  process.logger?.info('Initialising SASjs...')
  const parentFolderName = '.'

  await setupNpmProject(parentFolderName)

  await setupGitIgnore(parentFolderName)

  await setupGhooks(parentFolderName)

  await setupDoxygen(parentFolderName)

  await createConfigFile(parentFolderName)

  const lintConfigPath = path.join(
    process.projectDir,
    parentFolderName,
    '.sasjslint'
  )
  if (!(await fileExists(lintConfigPath)))
    await createLintConfigFile(parentFolderName)
}
