import path from 'path'

import { DefaultLintConfiguration } from '@sasjs/lint/utils/getLintConfig'
import { createFile, fileExists } from '../../utils/file'

/**
 * Creates a SASjs Lint configuration file.
 * Its name will be of the form '.sasjslint'
 * @param {string} parentFolderName- the name of the project folder.
 */
export const createLintConfigFile = async (parentFolderName: string) => {
  const configDestinationPath = path.join(
    process.projectDir,
    parentFolderName,
    '.sasjslint'
  )
  if (!(await fileExists(configDestinationPath)))
    await createFile(
      configDestinationPath,
      JSON.stringify(DefaultLintConfiguration, null, 2)
    )
}
