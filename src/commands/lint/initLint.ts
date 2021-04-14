import { createLintConfigFile } from '../shared/createLintConfigFile'

export async function initLint() {
  const parentFolderName = '.'
  await createLintConfigFile(parentFolderName)
}
