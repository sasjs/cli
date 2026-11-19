import path from 'path'

import { DefaultLintConfiguration, lintSchemaUrl } from '@sasjs/lint'
import { createFile } from '@sasjs/utils'

/**
 * Where the settings of a `.sasjslint` are documented, for a resolved linter
 * that predates the export.
 *
 * A consumer's `overrides` decides which `@sasjs/lint` this package resolves:
 * `dc/dc` pins it back to 5.3.0 in `sas/package.json` so its own lint run is
 * stable, and 5.3.0 does not export `lintSchemaUrl`. An import alone is then
 * `undefined`, and `JSON.stringify` drops the key, so the file would lose the
 * one thing that tells an editor where its settings are described.
 *
 * This copy is a fallback rather than the source, and the spec holds it to the
 * linter's own address, so a move or rename upstream fails here instead of
 * leaving the written file stale.
 */
const lintSchemaFallback =
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
  const config = {
    $schema: lintSchemaUrl ?? lintSchemaFallback,
    ...DefaultLintConfiguration
  }

  await createFile(configDestinationPath, JSON.stringify(config, null, 2))
}
