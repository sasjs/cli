import path from 'path'
import {
  Target,
  createFolder,
  readFile,
  fileExists,
  deleteFolder,
  generateTimestamp,
  createFile,
  folderExists
} from '@sasjs/utils'
import { BuildConfig } from '@sasjs/utils/types/config'
import {
  findTargetInConfiguration,
  saveGlobalRcFile
} from '../../../utils/config'
import {
  createTestApp,
  createTestJobsApp,
  removeTestApp,
  removeAllTargetsFromConfigs,
  verifyCompiledService,
  updateConfig,
  updateTarget
} from '../../../utils/test'
import * as compileModule from '../compile'
import { compileSingleFile } from '../compileSingleFile'
import * as compileFile from '../internal/compileFile'
import { setConstants } from '../../../utils'
import { CompileCommand } from '../compileCommand'

describe('sasjs compile', () => {
  let sharedAppName: string
  let appName: string
  let target: Target
  const homedir = require('os').homedir()

  beforeAll(async () => {
    sharedAppName = `cli-tests-compile-${generateTimestamp()}`
    await createTestApp(homedir, sharedAppName)
  })
  beforeEach(async () => {
    appName = `cli-tests-compile-${generateTimestamp()}`
    await createTestApp(__dirname, appName)
    target = (await findTargetInConfiguration('viya')).target
    jest.spyOn(compileModule, 'copyFilesToBuildFolder')
    jest.spyOn(compileModule, 'compileJobsServicesTests')
  })

  afterEach(async () => {
    await removeTestApp(__dirname, appName)
  })

  afterAll(async () => {
    await removeTestApp(homedir, sharedAppName)
  })

  it('it should compile project from sub folder', async () => {
    const serviceFolder = path.join(
      process.projectDir,
      'sasjs',
      'services',
      'admin'
    )
    const testFile = 'dostuff.test.sas'
    const wrongSasjsBuildFolder = path.join(serviceFolder, 'sasjsbuild')
    const correctSasjsBuildFolder = path.join(process.currentDir, 'sasjsbuild')
    const correctBuildFile = path.join(
      correctSasjsBuildFolder,
      'tests',
      'services',
      'admin',
      testFile
    )

    await createFile(path.join(serviceFolder, testFile), '')

    process.currentDir = serviceFolder

    await expect(compileModule.compile(target)).toResolve()
    await expect(folderExists(wrongSasjsBuildFolder)).resolves.toEqual(false)
    await expect(folderExists(correctSasjsBuildFolder)).resolves.toEqual(true)
    await expect(fileExists(correctBuildFile)).resolves.toEqual(true)
  })

  it('should compile an uncompiled project', async () => {
    await expect(compileModule.compile(target)).toResolve()
    expect(compileModule.copyFilesToBuildFolder).toHaveBeenCalled()
    expect(compileModule.compileJobsServicesTests).toHaveBeenCalled()
  })

  it('should compile an uncompiled project with absolute macroPaths', async () => {
    const absolutePathToSharedApp = path.join(homedir, sharedAppName)
    await updateConfig(
      {
        macroFolders: [`${absolutePathToSharedApp}/sasjs/macros`]
      },
      true
    )
    await updateTarget(
      {
        macroFolders: [`${absolutePathToSharedApp}/sasjs/targets/viya/macros`]
      },
      'viya',
      true
    )
    await expect(compileModule.compile(target)).toResolve()
    expect(compileModule.copyFilesToBuildFolder).toHaveBeenCalled()
    expect(compileModule.compileJobsServicesTests).toHaveBeenCalled()
  })

  it('should compile project with having tilde in paths', async () => {
    const tildePathToApp = path.join(__dirname, appName).replace(homedir, '~')

    await updateConfig(prefixConfigWithPath(tildePathToApp), true)
    await updateTarget(prefixTargetConfigWithPath(tildePathToApp), 'viya', true)

    await expect(compileModule.compile(target)).toResolve()
    expect(compileModule.copyFilesToBuildFolder).toHaveBeenCalled()
    expect(compileModule.compileJobsServicesTests).toHaveBeenCalled()
  })

  it('should compile an uncompiled project having no target', async () => {
    await removeAllTargetsFromConfigs()

    await expect(compileModule.compile({} as Target)).toResolve()
    expect(compileModule.copyFilesToBuildFolder).toHaveBeenCalled()
    expect(compileModule.compileJobsServicesTests).toHaveBeenCalled()
  })

  it('should fail to compile for missing program file', async () => {
    const newTarget = new Target({
      ...target.toJson(),
      serviceConfig: {
        serviceFolders: ['../services']
      }
    })

    const errorMessage =
      `Unable to load dependencies for: ${path.join(
        __dirname,
        'services/example.sas'
      )}\n` +
      'The following files were listed under SAS Includes but could not be found:\n' +
      "1. 'doesnotexist.sas' with fileRef 'SOMEREF'\n" +
      'Please check that they exist in the folder(s) listed in the `programFolders` array in your sasjsconfig.json file.\n' +
      'Program Folders:\n' +
      `- ${path.join(__dirname, appName, 'sasjs/programs')}`
    await expect(compileModule.compile(newTarget)).rejects.toThrow(errorMessage)
    expect(compileModule.copyFilesToBuildFolder).toHaveBeenCalled()
    expect(compileModule.compileJobsServicesTests).toHaveBeenCalled()
  })

  it('should skip compilation if a project is already compiled', async () => {
    await expect(compileModule.compile(target)).toResolve()
    expect(compileModule.copyFilesToBuildFolder).toHaveBeenCalled()
    expect(compileModule.compileJobsServicesTests).toHaveBeenCalled()

    jest.resetAllMocks()

    await compileModule.compile(target)
    expect(compileModule.copyFilesToBuildFolder).not.toHaveBeenCalled()
    expect(compileModule.compileJobsServicesTests).not.toHaveBeenCalled()
  })
})

describe('sasjs compile single file', () => {
  let appName: string
  let target: Target

  afterEach(async () => {
    await removeTestApp(__dirname, appName)
  })

  describe('job', () => {
    beforeEach(async () => {
      appName = `cli-tests-compile-${generateTimestamp()}`
      await createTestJobsApp(__dirname, appName)
      target = (await findTargetInConfiguration('viya')).target
      jest.spyOn(compileFile, 'compileFile')
    })

    it('should compile single file', async () => {
      const command = new CompileCommand([
        'node',
        'sasjs',
        'compile',
        'job',
        '-s',
        './jobs/extract/makedata1.sas'
      ])
      const output = await command.output
      await expect(
        compileSingleFile(target, 'job', command.source, output)
      ).toResolve()
      expect(compileFile.compileFile).toHaveBeenCalled()
    })

    it('should compile single file with absolute path', async () => {
      const command = new CompileCommand([
        'node',
        'sasjs',
        'compile',
        'job',
        '-s',
        './jobs/extract/makedata1.sas'
      ])
      const output = await command.output
      await expect(
        compileSingleFile(target, 'job', command.source, output)
      ).toResolve()
      expect(compileFile.compileFile).toHaveBeenCalled()
    })
  })

  describe('service', () => {
    beforeEach(async () => {
      appName = `cli-tests-compile-${generateTimestamp()}`
      await createTestApp(__dirname, appName)
      target = (await findTargetInConfiguration('viya')).target
      jest.spyOn(compileFile, 'compileFile')
    })

    it('should compile single file', async () => {
      const command = new CompileCommand([
        'node',
        'sasjs',
        'compile',
        'service',
        '-s',
        'sasjs/services/common/example.sas'
      ])
      const output = await command.output
      await expect(
        compileSingleFile(target, 'service', command.source, output)
      ).toResolve()
      expect(compileFile.compileFile).toHaveBeenCalled()
    })

    it('should compile single file with absolute path', async () => {
      const command = new CompileCommand([
        'node',
        'sasjs',
        'compile',
        'service',
        '-s',
        `${process.projectDir}/sasjs/services/common/example.sas`
      ])

      const output = await command.output

      await expect(
        compileSingleFile(target, 'service', command.source, output)
      ).toResolve()
      expect(compileFile.compileFile).toHaveBeenCalled()
    })

    it('should compile service without duplicates', async () => {
      const compiledPath = path.join(
        process.projectDir,
        'sasjsbuild',
        'services',
        'admin',
        'dostuff.sas'
      )

      await compileModule.compile(target)

      const compiledService = await readFile(compiledPath)

      expect(compiledService.match(/%macro mv_webout/g)!.length).toEqual(1)
    })
  })
})

const defaultBuildConfig: BuildConfig = {
  buildOutputFolder: '.sasjs/sasjsbuild',
  buildOutputFileName: 'test.sas',
  initProgram: '',
  termProgram: '',
  macroVars: {}
}

describe('sasjs compile outside project', () => {
  let sharedAppName: string
  let appName: string
  let parentOutputFolder: string
  const homedir = require('os').homedir()

  describe('with global config', () => {
    beforeAll(async () => {
      sharedAppName = `cli-tests-compile-${generateTimestamp()}`
      await createTestApp(homedir, sharedAppName)
    })

    beforeEach(async () => {
      appName = `cli-tests-compile-${generateTimestamp()}`
      await updateConfig(
        {
          macroFolders: [
            `./${sharedAppName}/sasjs/macros`,
            `./${sharedAppName}/sasjs/targets/viya/macros`
          ]
        },
        false
      )
      process.projectDir = ''
      await setConstants()

      process.currentDir = path.join(__dirname, appName)
      await createFolder(process.currentDir)
    })

    afterEach(async () => {
      await updateConfig(
        {
          macroFolders: [],
          buildConfig: defaultBuildConfig
        },
        false
      )
      await deleteFolder(parentOutputFolder)
      await deleteFolder(process.currentDir)
    })

    afterAll(async () => {
      await removeTestApp(homedir, sharedAppName)
      await deleteFolder(path.join(homedir, '.sasjs'))
    })

    it('should compile single file', async () => {
      const buildOutputFolder = path.join(homedir, '.sasjs', 'sasjsbuild')
      const destinationPath = path.join(
        buildOutputFolder,
        'services',
        'services',
        'example1.sas'
      )

      parentOutputFolder = buildOutputFolder

      const command = new CompileCommand([
        'node',
        'sasjs',
        'compile',
        'service',
        '-s',
        '../services/example1.sas'
      ])
      const output = await command.output

      await expect(
        compileSingleFile(
          undefined as unknown as Target,
          'service',
          command.source,
          output
        )
      ).resolves.toEqual({
        destinationPath
      })

      await expect(fileExists(destinationPath)).resolves.toEqual(true)

      const compiledContent = await readFile(destinationPath)

      const macrosToTest: string[] = [
        'mf_nobs',
        'examplemacro',
        'yetanothermacro'
      ]

      await verifyCompiledService(compiledContent, macrosToTest, false, false)
    })

    it('should compile single file with absolute macroFolder paths', async () => {
      const buildOutputFolder = path.join(homedir, '.sasjs', 'sasjsbuild')
      const destinationPath = path.join(
        buildOutputFolder,
        'services',
        'services',
        'example1.sas'
      )
      const absolutePathToSharedApp = path.join(homedir, sharedAppName)

      parentOutputFolder = buildOutputFolder

      await updateConfig(
        {
          macroFolders: [
            `${absolutePathToSharedApp}/sasjs/macros`,
            `${absolutePathToSharedApp}/sasjs/targets/viya/macros`
          ]
        },
        false
      )

      const command = new CompileCommand([
        'node',
        'sasjs',
        'compile',
        'service',
        '-s',
        '../services/example1.sas'
      ])
      const output = await command.output
      await expect(
        compileSingleFile(
          undefined as unknown as Target,
          'service',
          command.source,
          output
        )
      ).resolves.toEqual({
        destinationPath
      })

      await expect(fileExists(destinationPath)).resolves.toEqual(true)

      const compiledContent = await readFile(destinationPath)

      const macrosToTest: string[] = [
        'mf_nobs',
        'examplemacro',
        'yetanothermacro'
      ]

      await verifyCompiledService(compiledContent, macrosToTest, false, false)
    })

    it('should fail to compile single file', async () => {
      const buildOutputFolder = path.join(homedir, '.sasjs', 'sasjsbuild')
      parentOutputFolder = buildOutputFolder
      const dependencies = ['examplemacro.sas', 'yetanothermacro.sas']
      await updateConfig(
        {
          macroFolders: []
        },
        false
      )
      const command = new CompileCommand([
        'node',
        'sasjs',
        'compile',
        'service',
        '-s',
        '../services/example1.sas'
      ])
      const output = await command.output
      await expect(
        compileSingleFile(
          undefined as unknown as Target,
          'service',
          command.source,
          output
        )
      ).rejects.toEqual(
        `Unable to locate dependencies: ${dependencies.join(', ')}`
      )
    })

    it('should compile single file at absolute path in global config.buildConfig.buildOutputFolder', async () => {
      const buildOutputFolder = path.join(__dirname, 'random-folder', appName)
      const destinationPath = path.join(
        buildOutputFolder,
        'services',
        'services',
        'example1.sas'
      )

      parentOutputFolder = path.join(__dirname, 'random-folder')

      await updateConfig(
        {
          buildConfig: {
            ...defaultBuildConfig,
            buildOutputFolder
          }
        },
        false
      )
      await setConstants()

      const command = new CompileCommand([
        'node',
        'sasjs',
        'compile',
        'service',
        '-s',
        '../services/example1.sas'
      ])
      const output = await command.output
      await expect(
        compileSingleFile(
          undefined as unknown as Target,
          'service',
          command.source,
          output
        )
      ).resolves.toEqual({
        destinationPath
      })

      await expect(fileExists(destinationPath)).resolves.toEqual(true)

      const compiledContent = await readFile(destinationPath)

      const macrosToTest: string[] = [
        'mf_nobs',
        'examplemacro',
        'yetanothermacro'
      ]

      await verifyCompiledService(compiledContent, macrosToTest, false, false)
    })

    it('should compile single file at relative path in global config.buildConfig.buildOutputFolder', async () => {
      const buildOutputFolder = path.join(homedir, appName, 'random-folder')
      const destinationPath = path.join(
        buildOutputFolder,
        'services',
        'services',
        'example1.sas'
      )

      parentOutputFolder = path.join(homedir, appName)

      await updateConfig(
        {
          buildConfig: {
            ...defaultBuildConfig,
            buildOutputFolder: appName + '/random-folder'
          }
        },
        false
      )
      await setConstants()

      const command = new CompileCommand([
        'node',
        'sasjs',
        'compile',
        'service',
        '-s',
        '../services/example1.sas'
      ])
      const output = await command.output
      await expect(
        compileSingleFile(
          undefined as unknown as Target,
          'service',
          command.source,
          output
        )
      ).resolves.toEqual({
        destinationPath
      })

      await expect(fileExists(destinationPath)).resolves.toEqual(true)

      const compiledContent = await readFile(destinationPath)

      const macrosToTest: string[] = [
        'mf_nobs',
        'examplemacro',
        'yetanothermacro'
      ]

      await verifyCompiledService(compiledContent, macrosToTest, false, false)
    })
  })

  describe('without global config', () => {
    beforeEach(async () => {
      appName = `cli-tests-compile-${generateTimestamp()}`

      await saveGlobalRcFile('')
      await setConstants()

      process.projectDir = ''
      process.currentDir = path.join(__dirname, appName)

      await createFolder(process.currentDir)
    })

    afterEach(async () => {
      await deleteFolder(process.currentDir)
    })

    it('should fail to compile single file', async () => {
      const dependencies = ['examplemacro.sas', 'yetanothermacro.sas']
      const command = new CompileCommand([
        'node',
        'sasjs',
        'compile',
        'service',
        '-s',
        '../services/example1.sas'
      ])
      const output = await command.output
      await expect(
        compileSingleFile(
          undefined as unknown as Target,
          'service',
          command.source,
          output
        )
      ).rejects.toEqual(
        `Unable to locate dependencies: ${dependencies.join(', ')}`
      )
    })

    it('should compile without duplicates', async () => {
      const testServicePath = path.join('services', 'admin', 'test.sas')
      const appPath = path.join(__dirname, appName)

      await createTestApp(__dirname, appName)
      await createFile(
        path.join(appPath, 'sasjs', 'targets', 'viya', testServicePath),
        ''
      )

      const command = new CompileCommand([
        'node',
        'sasjs',
        'compile',
        '-t',
        'viya'
      ])
      await command.executeCompile()

      const compiledTestService = await readFile(
        path.join(appPath, 'sasjsbuild', testServicePath)
      )

      expect(
        compiledTestService.match(/^\*\sService start;$/gm)?.length
      ).toEqual(1)
    })
  })
})

const prefixConfigWithPath = (prefixPath: string) => ({
  buildConfig: {
    initProgram: `${prefixPath}/sasjs/build/buildinit.sas`,
    termProgram: `${prefixPath}/sasjs/build/buildterm.sas`,
    buildOutputFolder: `${prefixPath}/sasjsbuild`,
    buildResultsFolder: `${prefixPath}/sasjsresults`,
    macroVars: {
      name: 'value',
      numvar: '42'
    },
    buildOutputFileName: 'undefined'
  },
  deployConfig: {
    deployServicePack: false,
    deployScripts: [`${prefixPath}/sasjs/build/deployscript.sh`]
  },
  serviceConfig: {
    serviceFolders: [
      `${prefixPath}/sasjs/services/common`,
      `${prefixPath}/sasjs/services/admin`
    ],
    initProgram: `${prefixPath}/sasjs/build/serviceinit.sas`,
    termProgram: `${prefixPath}/sasjs/build/serviceterm.sas`,
    macroVars: {
      name: 'value',
      numvar: '42'
    }
  },
  macroFolders: [`${prefixPath}/sasjs/macros`],
  programFolders: [`${prefixPath}/sasjs/programs`]
})

const prefixTargetConfigWithPath = (prefixPath: string) => ({
  buildConfig: {
    buildOutputFileName: 'myviyadeploy.sas',
    initProgram: `${prefixPath}/sasjs/build/buildinitviya.sas`,
    termProgram: `${prefixPath}/sasjs/targets/viya/viyabuildterm.sas`,
    macroVars: {
      name: 'viyavalue',
      extravar: 'this too'
    }
  },
  deployConfig: {
    deployServicePack: true,
    deployScripts: [`${prefixPath}/sasjsbuild/myviyadeploy.sas`]
  },
  serviceConfig: {
    serviceFolders: [`${prefixPath}/sasjs/targets/viya/services/admin`],
    initProgram: `${prefixPath}/sasjs/build/serviceinit.sas`,
    termProgram: `${prefixPath}/sasjs/build/serviceinit.sas`,
    macroVars: {
      name: 'viyavalue',
      extravar: 'this too'
    }
  },

  macroFolders: [`${prefixPath}/sasjs/targets/viya/macros`]
})
