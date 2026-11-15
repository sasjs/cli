import path from 'path'

import { DefaultLintConfiguration } from '@sasjs/lint'
import { createFile } from '@sasjs/utils'

/**
 * Where the settings of a `.sasjslint` are documented.
 *
 * A copy of the linter's own address rather than an import of it: a consumer's
 * `overrides` can resolve `@sasjs/lint` to a version older than the one this
 * package pins (`dc/dc` pins the linter back to 5.3.0 so its own lint run is
 * stable), and `lintSchemaUrl` did not exist there - importing it wrote the file
 * with the key missing altogether, since `JSON.stringify` drops `undefined`.
 *
 * The file is read as strict JSON and cannot carry comments, so this key is the
 * only thing that tells an editor where the settings are described.
 */
const lintSchemaUrl =
  'https://raw.githubusercontent.com/sasjs/lint/main/sasjslint-schema.json'

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
  const config = { $schema: lintSchemaUrl, ...DefaultLintConfiguration }

  await createFile(configDestinationPath, JSON.stringify(config, null, 2))
}
