import path from 'path'

import { DefaultLintConfiguration } from '@sasjs/lint'
import { createFile } from '@sasjs/utils'

/**
 * Where the settings of a `.sasjslint` are documented.
 *
 * The file is read as strict JSON, so it cannot carry comments - the same
 * problem `sasjsconfig.json` answers with `$schema`. An editor that understands
 * JSON schemas then completes the settings and shows each one's description as
 * it is typed.
 *
 * This is the schema itself, not a redirect: `cli.sasjs.io` serves a document
 * that only `$ref`s this address, and an editor that refuses to follow a ref to
 * another host reports the schema as untrusted and offers no completions.
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
