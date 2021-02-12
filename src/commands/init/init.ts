import path from 'path'

import {
  setupNpmProject,
  setupGitIgnore,
  setupDoxygen
} from '../../utils/utils'

import { createFolder } from '../../utils/file'
import { createFileStructure } from '../shared/createFileStructure'

export async function init() {
  process.logger?.info('Creating folders and files...')
  const parentFolderName = '.'

  await createFileStructure(parentFolderName)

  await setupNpmProject(parentFolderName)

  await setupGitIgnore(parentFolderName)

  await setupDoxygen(parentFolderName)
}
