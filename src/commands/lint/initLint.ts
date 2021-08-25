import path from 'path'

import { fileExists } from '@sasjs/utils'
import { createLintConfigFile } from '../shared/createLintConfigFile'

/**
 * Creates a .sasjslint configuration file in the current SASjs project if one doesn't already exist
 */
export async function initLint(): Promise<{ fileAlreadyExisted: boolean }> {
  const lintConfigPath = path.join(process.projectDir, '.sasjslint')
  if (await fileExists(lintConfigPath)) return { fileAlreadyExisted: true }
  else await createLintConfigFile('.')
  return { fileAlreadyExisted: false }
}
