import path from 'path'

import { DefaultLintConfiguration, lintSchemaUrl } from '@sasjs/lint'
import { createFile } from '@sasjs/utils'

/**
 * Creates a SASjs Lint configuration file.
 * Its name will be of the form '.sasjslint'
 *
 * The `$schema` is the linter's own `lintSchemaUrl` rather than a copy of it:
 * the file is read as strict JSON and cannot carry comments, so the schema is
 * the only place its settings are described, and an editor shows the
 * description from whatever document the linter itself names - the one its own
 * `$id` and its parse errors point at.
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
