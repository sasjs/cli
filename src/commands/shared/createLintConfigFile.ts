import path from 'path'

import { DefaultLintConfiguration } from '@sasjs/lint'
import { createFile } from '@sasjs/utils'

/**
 * Where the settings of a `.sasjslint` are documented.
 *
 * The file is read as strict JSON, so it cannot carry comments - the same
 * problem `sasjsconfig.json` answers with `$schema`, and the same address
 * pattern (`sasjs init` writes https://cli.sasjs.io/sasjsconfig-schema.json).
 * An editor that understands JSON schemas then completes the settings and
 * shows each one's description as it is typed.
 */
const lintSchemaUrl = 'https://cli.sasjs.io/sasjslint-schema.json'

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
