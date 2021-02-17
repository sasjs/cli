import path from 'path'

import {
  setupNpmProject,
  setupGitIgnore,
  setupDoxygen
} from '../../utils/utils'

import { createFolder } from '../../utils/file'
import { createConfigFile } from '../shared/createConfigFile'

export async function init() {
  process.logger?.info('Initialising SASjs...')
  const parentFolderName = '.'

  await setupDoxygen(parentFolderName)
  await createConfigFile(parentFolderName)

  await setupNpmProject(parentFolderName)
  await setupGitIgnore(parentFolderName)
}
