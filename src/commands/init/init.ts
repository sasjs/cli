import path from 'path'

import {
  setupNpmProject,
  setupGitIgnore,
  setupGhooks,
  setupDoxygen
} from '../../utils/utils'

import { createFolder } from '../../utils/file'
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

  await createLintConfigFile(parentFolderName)
}
