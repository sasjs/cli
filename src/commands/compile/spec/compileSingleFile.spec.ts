import path from 'path'
import fs from 'fs'
import os from 'os'
import {
  compileSingleFile,
  CompileSingleFileSubCommands
} from '../compileSingleFile'
import * as identifySasFileModule from '../internal/identifySasFile'
import * as fileModule from '@sasjs/utils/file'
import * as configModule from '../../../utils/config'
import * as loadDependenciesModule from '../internal/loadDependencies'
import * as compileTestFileModule from '../internal/compileTestFile'
import * as compileFileModule from '../internal/compileFile'
import * as getAllFoldersModule from '../internal/getAllFolders'
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
      .mockImplementation(() => ({ saveTree: () => Promise.resolve() }) as any)
    jest
      .spyOn(compileTestFileModule, 'compileTestFile')
      .mockImplementation(() => Promise.resolve())
    jest
      .spyOn(getAllFoldersModule, 'getAllFolders')
      .mockImplementation(() => Promise.resolve(['testCurrentDir']))
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

  describe('destination folder', () => {
    const projectRoot = 'project'
    const originalConstants = process.sasjsConstants
    const source = path.join('sasjs', 'jobs', 'daily', 'myjob.sas')

    beforeEach(() => {
      process.sasjsConstants = {
        buildDestinationJobsFolder: path.join('project', 'sasjsbuild', 'jobs'),
        buildDestinationServicesFolder: path.join(
          'project',
          'sasjsbuild',
          'services'
        )
      } as any

      jest.spyOn(fileModule, 'fileExists').mockResolvedValue(true)
      jest.spyOn(fileModule, 'deleteFolder').mockResolvedValue(undefined as any)
      jest.spyOn(fileModule, 'createFolder').mockResolvedValue(undefined as any)
      jest.spyOn(fileModule, 'copy').mockResolvedValue(undefined as any)
      jest
        .spyOn(configModule, 'getMacroFolders')
        .mockImplementation(() => Promise.resolve([]))
      jest
        .spyOn(configModule, 'getProgramFolders')
        .mockImplementation(() => Promise.resolve([]))
      jest
        .spyOn(loadDependenciesModule, 'getCompileTree')
        .mockImplementation(
          () => ({ saveTree: () => Promise.resolve() }) as any
        )
      jest
        .spyOn(getAllFoldersModule, 'getAllFolders')
        .mockImplementation((_target: any, type: any) =>
          Promise.resolve(
            type === 'job'
              ? [path.join(projectRoot, 'sasjs', 'jobs', 'daily')]
              : [path.join(projectRoot, 'sasjs', 'services', 'example')]
          )
        )
      jest
        .spyOn(compileFileModule, 'compileFile')
        .mockImplementation(() => Promise.resolve())
      jest
        .spyOn(compileTestFileModule, 'compileTestFile')
        .mockImplementation(() => Promise.resolve())
    })

    afterEach(() => {
      process.sasjsConstants = originalConstants
    })

    it('should send an identified job to the jobs folder', async () => {
      jest
        .spyOn(identifySasFileModule, 'identifySasFile')
        .mockImplementation(() => Promise.resolve(SasFileType.Job))

      const { destinationPath } = await compileSingleFile(
        {} as any,
        'identify',
        source,
        undefined,
        false,
        projectRoot
      )

      expect(destinationPath).toEqual(
        path.join('project', 'sasjsbuild', 'jobs', 'daily', 'myjob.sas')
      )
    })

    it('should send an identified service to the services folder', async () => {
      jest
        .spyOn(identifySasFileModule, 'identifySasFile')
        .mockImplementation(() => Promise.resolve(SasFileType.Service))

      const serviceSource = path.join(
        'sasjs',
        'services',
        'example',
        'myService.sas'
      )

      const { destinationPath } = await compileSingleFile(
        {} as any,
        'identify',
        serviceSource,
        undefined,
        false,
        projectRoot
      )

      expect(destinationPath).toEqual(
        path.join(
          'project',
          'sasjsbuild',
          'services',
          'example',
          'myService.sas'
        )
      )
    })

    it('should point _program at the leaf folder of the source', async () => {
      const compileFileSpy = jest
        .spyOn(compileFileModule, 'compileFile')
        .mockImplementation(() => Promise.resolve())

      await compileSingleFile(
        { appLoc: '/Public/app' } as any,
        'job',
        source,
        undefined,
        true,
        projectRoot
      )

      const programVar = compileFileSpy.mock.calls[0][4]

      expect(programVar).toContain(
        '%let _program=/Public/app/jobs/daily/myjob;'
      )
    })

    it('should file a test under tests/<where the test lives>', async () => {
      const serviceTest = path.join(
        'sasjs',
        'services',
        'example',
        'check.test.sas'
      )

      process.sasjsConstants = {
        ...process.sasjsConstants,
        buildDestinationTestFolder: path.join('project', 'sasjsbuild', 'tests')
      } as any

      const { destinationPath } = await compileSingleFile(
        {} as any,
        'test',
        serviceTest,
        undefined,
        false,
        projectRoot
      )

      expect(destinationPath).toEqual(
        path.join(
          'project',
          'sasjsbuild',
          'tests',
          'services',
          'example',
          'check.test.sas'
        )
      )
    })

    it('should take the test kind from a tests/<type> path', async () => {
      process.sasjsConstants = {
        ...process.sasjsConstants,
        buildDestinationTestFolder: path.join('project', 'sasjsbuild', 'tests')
      } as any

      const { destinationPath } = await compileSingleFile(
        {} as any,
        'test',
        path.join('sasjs', 'tests', 'jobs', 'load.test.sas'),
        undefined,
        false,
        projectRoot
      )

      expect(destinationPath).toEqual(
        path.join('project', 'sasjsbuild', 'tests', 'jobs', 'load.test.sas')
      )
    })

    it('should write below the output base when one is given', async () => {
      const { destinationPath } = await compileSingleFile(
        {} as any,
        'job',
        source,
        path.join('/tmp', 'out'),
        false,
        projectRoot
      )

      expect(destinationPath).toEqual(
        path.join('/tmp', 'out', 'jobs', 'daily', 'myjob.sas')
      )
    })

    it('should keep a dotted file name in _program', async () => {
      const compileFileSpy = jest
        .spyOn(compileFileModule, 'compileFile')
        .mockImplementation(() => Promise.resolve())

      await compileSingleFile(
        { appLoc: '/Public/app' } as any,
        'job',
        path.join('sasjs', 'jobs', 'daily', 'load.daily.sas'),
        undefined,
        true,
        projectRoot
      )

      expect(compileFileSpy.mock.calls[0][4]).toContain(
        '%let _program=/Public/app/jobs/daily/load.daily;'
      )
    })

    it('should refuse a sub command it does not know', async () => {
      jest
        .spyOn(identifySasFileModule, 'identifySasFile')
        .mockImplementation(() => Promise.resolve('nonsense' as any))

      await expect(
        compileSingleFile(
          {} as any,
          'identify',
          source,
          undefined,
          false,
          projectRoot
        )
      ).rejects.toThrow(
        'Single file compilation failed. Unsupported sub command: nonsense'
      )
    })

    it('should refuse a test it cannot file under any tree', async () => {
      await expect(
        compileSingleFile(
          {} as any,
          'test',
          path.join('elsewhere', 'loose.test.sas'),
          undefined,
          false,
          projectRoot
        )
      ).rejects.toThrow(/Cannot tell which test tree/)
    })

    it('should delete nothing, so sibling compiled files survive', async () => {
      const deleteFolderSpy = jest.spyOn(fileModule, 'deleteFolder')
      const createFolderSpy = jest.spyOn(fileModule, 'createFolder')

      await compileSingleFile(
        {} as any,
        'job',
        source,
        undefined,
        false,
        projectRoot
      )

      expect(deleteFolderSpy).not.toHaveBeenCalled()
      // the folder is created if missing (mkdir is recursive and idempotent)
      expect(createFolderSpy).toHaveBeenCalledWith(
        path.join('project', 'sasjsbuild', 'jobs', 'daily')
      )
    })
  })

  describe('sibling files on disk', () => {
    const originalConstants = process.sasjsConstants
    let root: string

    beforeEach(async () => {
      jest.restoreAllMocks()
      root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'sasjs-single-'))
      process.sasjsConstants = {
        buildDestinationJobsFolder: path.join(root, 'sasjsbuild', 'jobs'),
        buildDestinationServicesFolder: path.join(
          root,
          'sasjsbuild',
          'services'
        )
      } as any

      jest
        .spyOn(configModule, 'getMacroFolders')
        .mockImplementation(() => Promise.resolve([]))
      jest
        .spyOn(configModule, 'getProgramFolders')
        .mockImplementation(() => Promise.resolve([]))
      jest
        .spyOn(loadDependenciesModule, 'getCompileTree')
        .mockImplementation(
          () => ({ saveTree: () => Promise.resolve() }) as any
        )
      jest
        .spyOn(getAllFoldersModule, 'getAllFolders')
        .mockImplementation(() =>
          Promise.resolve([path.join(root, 'sasjs', 'jobs', 'daily')])
        )
      jest
        .spyOn(compileFileModule, 'compileFile')
        .mockImplementation(() => Promise.resolve())
    })

    afterEach(async () => {
      process.sasjsConstants = originalConstants
      await fs.promises.rm(root, { recursive: true, force: true })
    })

    it('should keep a sibling compiled file in the same leaf folder', async () => {
      const sourceFolder = path.join(root, 'sasjs', 'jobs', 'daily')
      await fs.promises.mkdir(sourceFolder, { recursive: true })
      await fs.promises.writeFile(
        path.join(sourceFolder, 'first.sas'),
        '/**\n  @file first.sas\n**/\n'
      )
      await fs.promises.writeFile(
        path.join(sourceFolder, 'second.sas'),
        '/**\n  @file second.sas\n**/\n'
      )

      await compileSingleFile(
        {} as any,
        'job',
        path.join(sourceFolder, 'first.sas')
      )
      await compileSingleFile(
        {} as any,
        'job',
        path.join(sourceFolder, 'second.sas')
      )

      const written = await fs.promises.readdir(
        path.join(root, 'sasjsbuild', 'jobs', 'daily')
      )

      expect(written.sort()).toEqual(['first.sas', 'second.sas'])
    })

    it('should point _program at the folder the file is written to', async () => {
      const compileFileSpy = jest.spyOn(compileFileModule, 'compileFile')
      const sourceFile = path.join(root, 'loose.sas')
      await fs.promises.writeFile(sourceFile, '/**\n  @file loose.sas\n**/\n')

      await compileSingleFile(
        { appLoc: '/Public/app' } as any,
        'job',
        sourceFile,
        undefined,
        true
      )

      // not below a configured folder, so it lands in the type folder itself
      expect(
        await fs.promises.readFile(
          path.join(root, 'sasjsbuild', 'jobs', 'loose.sas'),
          'utf8'
        )
      ).toBeDefined()
      expect(compileFileSpy.mock.calls[0][4]).toContain(
        '%let _program=/Public/app/jobs/loose;'
      )
    })
  })
})
