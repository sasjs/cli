import {
  compileSingleFile,
  CompileSingleFileSubCommands
} from '../compileSingleFile'
import * as identifySasFileModule from '../internal/identifySasFile'
import * as fileModule from '@sasjs/utils/file'
import * as configModule from '../../../utils/config'
import * as loadDependenciesModule from '../internal/loadDependencies'
import * as compileTestFileModule from '../internal/compileTestFile'
import { SasFileType } from '../internal'

describe('compileSingleFile', () => {
  it('should throw an error provided not supported subcommand', async () => {
    const expectedError = new Error(
      `Unsupported context command. Supported commands are:\n${Object.values(
        CompileSingleFileSubCommands
      ).join('\n')}`
    )

    await expect(
      compileSingleFile({} as any, 'WRONG', 'testSource', 'testOutput')
    ).rejects.toEqual(expectedError)
  })

  it('should throw an error source was not provided', async () => {
    const expectedError = new Error(
      `'--source' flag is missing (eg 'sasjs compile <command> --source myjob.sas --target targetName -output /some/folder')`
    )

    await expect(
      compileSingleFile(
        {} as any,
        CompileSingleFileSubCommands.Test,
        '',
        'testOutput'
      )
    ).rejects.toEqual(expectedError)
  })

  it('should throw an error provided source path is not valid', async () => {
    const expectedError = new Error(
      `Provide a valid path to source file (eg 'sasjs compile <command> --source myjob.sas --target targetName -output /some/folder')`
    )

    await expect(
      compileSingleFile(
        {} as any,
        CompileSingleFileSubCommands.Test,
        'not valid',
        'testOutput',
        false,
        'testCurrentDir'
      )
    ).rejects.toEqual(expectedError)
  })

  it(`should identify sas file if a sub command is 'identify'`, async () => {
    const testFile = 'testSource.test.sas'

    jest
      .spyOn(fileModule, 'fileExists')
      .mockImplementation((filePath: string) =>
        Promise.resolve(filePath.includes(testFile))
      )
    jest.spyOn(fileModule, 'copy').mockImplementation(() => Promise.resolve())
    jest
      .spyOn(configModule, 'getMacroFolders')
      .mockImplementation(() => Promise.resolve([]))
    jest
      .spyOn(configModule, 'getProgramFolders')
      .mockImplementation(() => Promise.resolve([]))
    jest
      .spyOn(loadDependenciesModule, 'getCompileTree')
      .mockImplementation(() => ({ saveTree: () => Promise.resolve() } as any))
    jest
      .spyOn(compileTestFileModule, 'compileTestFile')
      .mockImplementation(() => Promise.resolve())
    jest.spyOn(identifySasFileModule, 'identifySasFile')

    await compileSingleFile(
      {} as any,
      'identify',
      testFile,
      'testOutput',
      false,
      'testCurrentDir'
    )

    expect(identifySasFileModule.identifySasFile).toHaveBeenCalledTimes(1)
  })

  it(`should throw an error if a sas file was not identified`, async () => {
    const identificationError = `Unable to identify file as ${SasFileType.Service}, ${SasFileType.Job} or ${SasFileType.Test}`

    jest
      .spyOn(fileModule, 'fileExists')
      .mockImplementation(() => Promise.resolve(true))
    jest
      .spyOn(identifySasFileModule, 'identifySasFile')
      .mockImplementation(() => Promise.reject(identificationError))

    const expectedError = `Single file compilation failed. ${identificationError}`

    await expect(
      compileSingleFile(
        {} as any,
        'identify',
        'testSource.sas',
        'testOutput',
        false,
        'testCurrentDir'
      )
    ).rejects.toEqual(expectedError)
  })
})
