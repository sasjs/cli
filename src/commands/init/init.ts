import path from 'path'

import {
  setupNpmProject,
  setupGitIgnore,
  setupDoxygen
} from '../../utils/utils'

import { fileExists, createFile } from '@sasjs/utils'
import { createLintConfigFile } from '../shared/createLintConfigFile'

export class AlreadyInitialisedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AlreadyInitialisedError'
    // The build targets ES5, where extending a built-in does not repair the
    // prototype chain - without this, `instanceof` is false at runtime.
    Object.setPrototypeOf(this, AlreadyInitialisedError.prototype)
  }
}

export async function init() {
  process.logger?.info('Initialising SASjs...')
  const parentFolderName = '.'

  const existingConfigPath = path.join(
    process.projectDir,
    parentFolderName,
    'sasjs',
    'sasjsconfig.json'
  )
  if (await fileExists(existingConfigPath)) {
    throw new AlreadyInitialisedError(
      'This folder is already a SASjs project (sasjs/sasjsconfig.json exists). Aborting without making changes.'
    )
  }

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

/**
 * Creates a SASjs configuration file.
 * Its name will be of the form 'sasjsconfig.json'
 * @param {string} parentFolderName- the name of the project folder.
 */
export const createConfigFile = async (parentFolderName: string) => {
  const config = {
    $schema: 'https://cli.sasjs.io/sasjsconfig-schema.json',
    macroFolders: ['sasjs/macros'],
    defaultTarget: 'mytarget',
    targets: [
      {
        name: 'mytarget',
        serverType: 'SASJS',
        serverUrl: ' ',
        appLoc: '/Public/apps/myapp'
      }
    ]
  }
  const configDestinationPath = path.join(
    process.projectDir,
    parentFolderName,
    'sasjs',
    'sasjsconfig.json'
  )
  await createFile(configDestinationPath, JSON.stringify(config, null, 2))
}
