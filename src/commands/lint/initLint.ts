import path from 'path'

import { fileExists } from '@sasjs/utils'
import { createLintConfigFile } from '../shared/createLintConfigFile'

/**
 * Initialises Lint Confiugartion in current sasjs application
 */
export async function initLint() {
  const lintConfigPath = path.join(process.projectDir, '.sasjslint')
  if (await fileExists(lintConfigPath)) return { fileAlreadyExisted: true }
  else await createLintConfigFile('.')
  return { fileAlreadyExisted: false }
}
