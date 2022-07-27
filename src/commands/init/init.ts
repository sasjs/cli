import path from 'path'

import {
  setupNpmProject,
  setupGitIgnore,
  setupDoxygen
} from '../../utils/utils'

import { fileExists } from '@sasjs/utils'
import { createConfigFile } from '../shared/createConfigFile'
import { createLintConfigFile } from '../shared/createLintConfigFile'

export async function init() {
  process.logger?.info('Initialising SASjs...')
  const parentFolderName = '.'

  await setupNpmProject(parentFolderName)

  await setupGitIgnore(parentFolderName)

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
