import { readFile } from 'fs/promises'
import * as os from 'os'
import * as path from 'path'

import { DefaultLintConfiguration, lintSchemaUrl } from '@sasjs/lint'
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
    jest.dontMock('@sasjs/lint')
    jest.resetModules()
  })

  const readWritten = async () =>
    JSON.parse(await readFile(path.join(projectDir, '.sasjslint'), 'utf-8'))

  it('writes every default setting, with the schema', async () => {
    await createLintConfigFile('.')

    const written = await readWritten()

    expect(written).toHaveProperty('$schema')
    expect(written.$schema).toEqual(lintSchemaUrl)

    // the settings are the package's own defaults - not a second list that can
    // drift from the linter
    const { $schema: _schema, ...settings } = written
    expect(settings).toEqual(DefaultLintConfiguration)
  })

  it('writes the schema when the resolved linter predates its export', async () => {
    // A consumer's `overrides` decides which @sasjs/lint this package resolves:
    // dc/dc pins it to 5.3.0 in `sas/package.json`, where `lintSchemaUrl` does
    // not exist - an import alone would leave `undefined`, and JSON.stringify
    // drops the key from the file.
    let createWithoutExport: typeof createLintConfigFile = createLintConfigFile

    jest.isolateModules(() => {
      jest.doMock('@sasjs/lint', () => ({
        ...jest.requireActual('@sasjs/lint'),
        lintSchemaUrl: undefined
      }))

      createWithoutExport =
        require('../createLintConfigFile').createLintConfigFile
    })

    await createWithoutExport('.')

    const written = await readWritten()

    expect(written).toHaveProperty('$schema')

    // and the fallback is the linter's own address, so a move or a rename
    // upstream fails here rather than leaving the written file stale
    expect(written.$schema).toEqual(
      jest.requireActual('@sasjs/lint').lintSchemaUrl
    )
  })
})
