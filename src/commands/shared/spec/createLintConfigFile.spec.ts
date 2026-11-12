import { readFile } from 'fs/promises'
import * as os from 'os'
import * as path from 'path'

import { DefaultLintConfiguration } from '@sasjs/lint'
import { createFolder } from '@sasjs/utils'

import { createLintConfigFile } from '../createLintConfigFile'

/**
 * The file this writes is the first thing a new project has to edit, and the
 * only place its settings are described: it is read as strict JSON, so it cannot
 * carry comments, and `$schema` is what gives an editor the description of each
 * setting where it is written.
 */
describe('createLintConfigFile', () => {
  const originalProjectDir = process.projectDir
  let projectDir: string

  beforeEach(async () => {
    projectDir = path.join(
      os.tmpdir(),
      `sasjs-lint-config-${Date.now()}-${Math.random().toString(36).slice(2)}`
    )
    await createFolder(projectDir)
    process.projectDir = projectDir
  })

  afterEach(() => {
    process.projectDir = originalProjectDir
  })

  it('writes every default setting, with the schema', async () => {
    await createLintConfigFile('.')

    const written = JSON.parse(
      await readFile(path.join(projectDir, '.sasjslint'), 'utf-8')
    )

    expect(written.$schema).toEqual(
      'https://cli.sasjs.io/sasjslint-schema.json'
    )

    // the settings are the package's own defaults - not a second list that can
    // drift from the linter
    const { $schema: _schema, ...settings } = written
    expect(settings).toEqual(DefaultLintConfiguration)
  })
})
