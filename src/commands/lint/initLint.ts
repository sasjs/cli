import { createLintConfigFile } from '../shared/createLintConfigFile'

/**
 * Initialises Lint Confiugartion in current sasjs application
 */
export async function initLint() {
  const parentFolderName = '.'
  await createLintConfigFile(parentFolderName)
}
