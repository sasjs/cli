import path from 'path'
import { Target, generateTimestamp } from '@sasjs/utils'
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
import {
  createFolder,
  readFile,
  fileExists,
  deleteFolder
} from '../../../utils/file'
import { Command } from '../../../utils/command'
import * as compileModule from '../compile'
import { compileSingleFile } from '../compileSingleFile'
import * as compileJobFile from '../internal/compileJobFile'
import * as compileServiceFile from '../internal/compileServiceFile'

describe('sasjs compile', () => {
  let sharedAppName: string
  let appName: string
  let target: Target
  let parentOutputFolder: string
  const homedir = require('os').homedir()

  beforeAll(async (done) => {
    sharedAppName = `cli-tests-compile-${generateTimestamp()}`
    await createTestApp(homedir, sharedAppName)
    done()
  })
  beforeEach(async (done) => {
    appName = `cli-tests-compile-${generateTimestamp()}`
    await createTestApp(__dirname, appName)
    target = (await findTargetInConfiguration('viya')).target
    jest.spyOn(compileModule, 'copyFilesToBuildFolder')
    jest.spyOn(compileModule, 'compileJobsServicesTests')
    done()
  })

  afterEach(async (done) => {
    await removeTestApp(__dirname, appName)
    jest.clearAllMocks()

    done()
  })

  it('should compile an uncompiled project', async (done) => {
    await expect(compileModule.compile(target)).toResolve()
    expect(compileModule.copyFilesToBuildFolder).toHaveBeenCalled()
    expect(compileModule.compileJobsServicesTests).toHaveBeenCalled()

    done()
  })

  it('should compile an uncompiled project with absolute macroPaths', async (done) => {
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

    done()
  })

  it('should compile an uncompiled project having no target', async (done) => {
    await removeAllTargetsFromConfigs()

    await expect(compileModule.compile({} as Target)).toResolve()
    expect(compileModule.copyFilesToBuildFolder).toHaveBeenCalled()
    expect(compileModule.compileJobsServicesTests).toHaveBeenCalled()

    done()
  })

  it('should fail to compile for missing program file', async (done) => {
    let newTarget = {
      ...target,
      serviceConfig: {
        serviceFolders: ['../services']
      }
    } as Target

    const errorMessage =
      'The following files were listed under SAS Programs but could not be found:\n' +
      "1. 'doesnotexist.sas' with fileRef 'SOMEREF'\n" +
      'Please check that they exist in the folder(s) listed in the `programFolders` array in your sasjsconfig.json file.\n' +
      'Program Folders:\n' +
      `- ${path.join(__dirname, appName, 'sasjs/programs')}`
    await expect(compileModule.compile(newTarget)).rejects.toThrow(errorMessage)
    expect(compileModule.copyFilesToBuildFolder).toHaveBeenCalled()
    expect(compileModule.compileJobsServicesTests).toHaveBeenCalled()

    done()
  })

  it('should skip compilation if a project is already compiled', async (done) => {
    await expect(compileModule.compile(target)).toResolve()
    expect(compileModule.copyFilesToBuildFolder).toHaveBeenCalled()
    expect(compileModule.compileJobsServicesTests).toHaveBeenCalled()

    jest.resetAllMocks()

    await compileModule.compile(target)
    expect(compileModule.copyFilesToBuildFolder).not.toHaveBeenCalled()
    expect(compileModule.compileJobsServicesTests).not.toHaveBeenCalled()

    done()
  })
})

describe('sasjs compile single file', () => {
  let appName: string
  let target: Target

  afterEach(async (done) => {
    await removeTestApp(__dirname, appName)
    jest.clearAllMocks()

    done()
  })

  describe('job', () => {
    beforeEach(async (done) => {
      appName = `cli-tests-compile-${generateTimestamp()}`
      await createTestJobsApp(__dirname, appName)
      target = (await findTargetInConfiguration('viya')).target
      jest.spyOn(compileJobFile, 'compileJobFile')
      done()
    })

    it('should compile single file', async (done) => {
      await expect(
        compileSingleFile(
          target,
          new Command(`compile job -s ./jobs/extract/makedata1.sas`),
          'job'
        )
      ).toResolve()
      expect(compileJobFile.compileJobFile).toHaveBeenCalled()

      done()
    })

    it('should compile single file with absolute path', async (done) => {
      await expect(
        compileSingleFile(
          target,
          new Command(
            `compile job -s ${process.projectDir}/jobs/extract/makedata1.sas`
          ),
          'job'
        )
      ).toResolve()
      expect(compileJobFile.compileJobFile).toHaveBeenCalled()

      done()
    })
  })

  describe('service', () => {
    beforeEach(async (done) => {
      appName = `cli-tests-compile-${generateTimestamp()}`
      await createTestApp(__dirname, appName)
      target = (await findTargetInConfiguration('viya')).target
      jest.spyOn(compileServiceFile, 'compileServiceFile')
      done()
    })

    it('should compile single file', async (done) => {
      await expect(
        compileSingleFile(
          target,
          new Command(`compile service -s sasjs/services/common/example.sas`),
          'service'
        )
      ).toResolve()
      expect(compileServiceFile.compileServiceFile).toHaveBeenCalled()

      done()
    })
    it('should compile single file with absolute path', async (done) => {
      await expect(
        compileSingleFile(
          target,
          new Command(
            `compile service -s ${process.projectDir}/sasjs/services/common/example.sas`
          ),
          'service'
        )
      ).toResolve()
      expect(compileServiceFile.compileServiceFile).toHaveBeenCalled()

      done()
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
    beforeAll(async (done) => {
      sharedAppName = `cli-tests-compile-${generateTimestamp()}`
      await createTestApp(homedir, sharedAppName)
      done()
    })

    beforeEach(async (done) => {
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
      process.currentDir = path.join(__dirname, appName)
      await createFolder(process.currentDir)
      done()
    })

    afterEach(async (done) => {
      await updateConfig(
        {
          macroFolders: [],
          buildConfig: defaultBuildConfig
        },
        false
      )
      await deleteFolder(parentOutputFolder)
      await deleteFolder(process.currentDir)
      done()
    })

    afterAll(async (done) => {
      await removeTestApp(homedir, sharedAppName)
      await deleteFolder(path.join(homedir, '.sasjs'))
      done()
    })

    it('should compile single file', async (done) => {
      const buildOutputFolder = path.join(homedir, '.sasjs', 'sasjsbuild')
      const destinationPath = `${buildOutputFolder}/services/services/example1.sas`
      parentOutputFolder = buildOutputFolder
      await expect(
        compileSingleFile(
          undefined as unknown as Target,
          new Command(`compile service -s ../services/example1.sas`),
          'service'
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

      done()
    })

    it('should compile single file with absolute macroFolder paths', async (done) => {
      const buildOutputFolder = path.join(homedir, '.sasjs', 'sasjsbuild')
      parentOutputFolder = buildOutputFolder
      const destinationPath = `${buildOutputFolder}/services/services/example1.sas`
      const absolutePathToSharedApp = path.join(homedir, sharedAppName)
      await updateConfig(
        {
          macroFolders: [
            `${absolutePathToSharedApp}/sasjs/macros`,
            `${absolutePathToSharedApp}/sasjs/targets/viya/macros`
          ]
        },
        false
      )
      await expect(
        compileSingleFile(
          undefined as unknown as Target,
          new Command(`compile service -s ../services/example1.sas`),
          'service'
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

      done()
    })

    it('should fail to compile single file', async (done) => {
      const buildOutputFolder = path.join(homedir, '.sasjs', 'sasjsbuild')
      parentOutputFolder = buildOutputFolder
      const dependencies = ['examplemacro.sas', 'yetanothermacro.sas']
      await updateConfig(
        {
          macroFolders: []
        },
        false
      )
      await expect(
        compileSingleFile(
          undefined as unknown as Target,
          new Command(`compile service -s ../services/example1.sas`),
          'service'
        )
      ).rejects.toEqual(
        `Unable to locate dependencies: ${dependencies.join(', ')}`
      )

      done()
    })

    it('should compile single file at absolute path in global config.buildConfig.buildOutputFolder', async (done) => {
      parentOutputFolder = path.join(__dirname, 'random-folder')
      const buildOutputFolder = path.join(__dirname, 'random-folder', appName)
      const destinationPath = `${buildOutputFolder}/services/services/example1.sas`
      await updateConfig(
        {
          buildConfig: {
            ...defaultBuildConfig,
            buildOutputFolder
          }
        },
        false
      )
      await expect(
        compileSingleFile(
          undefined as unknown as Target,
          new Command(`compile service -s ../services/example1.sas`),
          'service'
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

      done()
    })

    it('should compile single file at relative path in global config.buildConfig.buildOutputFolder', async (done) => {
      parentOutputFolder = path.join(homedir, appName)
      const buildOutputFolder = path.join(homedir, appName, 'random-folder')
      const destinationPath = `${buildOutputFolder}/services/services/example1.sas`
      await updateConfig(
        {
          buildConfig: {
            ...defaultBuildConfig,
            buildOutputFolder: appName + '/random-folder'
          }
        },
        false
      )
      await expect(
        compileSingleFile(
          undefined as unknown as Target,
          new Command(`compile service -s ../services/example1.sas`),
          'service'
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

      done()
    })
  })

  describe('without global config', () => {
    beforeEach(async (done) => {
      appName = `cli-tests-compile-${generateTimestamp()}`
      await saveGlobalRcFile('')
      process.projectDir = ''
      process.currentDir = path.join(__dirname, appName)
      await createFolder(process.currentDir)
      done()
    })

    afterEach(async (done) => {
      await deleteFolder(parentOutputFolder)
      await deleteFolder(process.currentDir)
      done()
    })

    it('should fail to compile single file', async (done) => {
      const dependencies = ['examplemacro.sas', 'yetanothermacro.sas']
      await expect(
        compileSingleFile(
          undefined as unknown as Target,
          new Command(`compile service -s ../services/example1.sas`),
          'service'
        )
      ).rejects.toEqual(
        `Unable to locate dependencies: ${dependencies.join(', ')}`
      )

      done()
    })
  })
})
