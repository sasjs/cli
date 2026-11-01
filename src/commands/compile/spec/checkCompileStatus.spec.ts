import path from 'path'
import { Target } from '@sasjs/utils'
import * as getAllFoldersModule from '../internal/getAllFolders'
import * as compareFoldersModule from '../internal/compareFolders'
import * as compileManifestModule from '../internal/compileManifest'
import { setConstants } from '../../../utils'
import { checkCompileStatus } from '../internal/checkCompileStatus'

jest.mock('../internal/getAllFolders')
jest.mock('../internal/compareFolders')
jest.mock('../internal/compileManifest')

describe('checkCompileStatus', () => {
  const target = { name: 'test' } as Target
  const folderMatch = { equal: true, reason: '' }

  beforeAll(async () => {
    await setConstants(false)
  })

  beforeEach(() => {
    jest.resetAllMocks()

    jest
      .spyOn(getAllFoldersModule, 'getAllFolders')
      .mockImplementation(() => Promise.resolve(['/app/sasjs/services']))

    jest
      .spyOn(compareFoldersModule, 'compareFolders')
      .mockImplementation(() => Promise.resolve(folderMatch))

    jest
      .spyOn(compileManifestModule, 'getManifestFolders')
      .mockImplementation(() => Promise.resolve([]))

    jest
      .spyOn(compileManifestModule, 'getManifestStamps')
      .mockImplementation(() => Promise.resolve([]))

    jest
      .spyOn(compileManifestModule, 'getChangedFiles')
      .mockImplementation(() => Promise.resolve([]))
  })

  it('reports a build folder that does not exist', async () => {
    const previous = process.sasjsConstants.buildDestinationFolder
    process.sasjsConstants.buildDestinationFolder = path.join(
      __dirname,
      'cli-tests-no-such-build-folder'
    )

    const result = await checkCompileStatus(target)

    expect(result.compiled).toBe(false)
    expect(result.message).toContain("doesn't exist")

    process.sasjsConstants.buildDestinationFolder = previous
  })

  it('says the project is compiled when the folders match and nothing changed', async () => {
    const result = await checkCompileStatus(target)

    expect(result.compiled).toBe(true)
  })

  it('names only the services side when the services are missing', async () => {
    jest
      .spyOn(getAllFoldersModule, 'getAllFolders')
      .mockImplementation((_target, type) =>
        Promise.resolve([
          type === 'job' ? '/app/sasjs/jobs' : '/app/sasjs/services'
        ])
      )

    jest
      .spyOn(compareFoldersModule, 'compareFolders')
      .mockImplementation((source: string) =>
        Promise.resolve(
          source.includes('services')
            ? { equal: false, reason: 'Files missing from build: getdata.sas' }
            : folderMatch
        )
      )

    const result = await checkCompileStatus(target)

    expect(result.compiled).toBe(false)
    expect(result.message).toContain('Missing Services:')
    expect(result.message).not.toContain('Missing jobs:')
  })

  it('names only the jobs side when the jobs are missing', async () => {
    jest
      .spyOn(getAllFoldersModule, 'getAllFolders')
      .mockImplementation((_target, type) =>
        Promise.resolve([
          type === 'job' ? '/app/sasjs/jobs' : '/app/sasjs/services'
        ])
      )

    jest
      .spyOn(compareFoldersModule, 'compareFolders')
      .mockImplementation((source: string) =>
        Promise.resolve(
          source.includes('jobs')
            ? { equal: false, reason: 'Subfolders missing from build: nightly' }
            : folderMatch
        )
      )

    const result = await checkCompileStatus(target)

    expect(result.compiled).toBe(false)
    expect(result.message).toContain('Missing jobs:')
    expect(result.message).not.toContain('Missing Services:')
  })

  it('reports the files that changed since the last compile', async () => {
    jest
      .spyOn(compileManifestModule, 'getChangedFiles')
      .mockImplementation(() =>
        Promise.resolve(['/app/sasjs/services/getdata.sas'])
      )

    const result = await checkCompileStatus(target)

    expect(result.compiled).toBe(false)
    expect(result.message).toContain(
      'Changed since the last compile: /app/sasjs/services/getdata.sas'
    )
  })
})
