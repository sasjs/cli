import path from 'path'
import dotenv from 'dotenv'
import { getConstants } from '../constants'
import {
  createFile,
  deleteFolder,
  fileExists,
  folderExists,
  readFile
} from './file'
import {
  ServerType,
  Target,
  TargetJson,
  Configuration
} from '@sasjs/utils/types'
import {
  getConfiguration,
  getLocalConfig,
  saveLocalConfigFile,
  saveToLocalConfig,
  getGlobalRcFile,
  saveGlobalRcFile,
  saveToGlobalConfig
} from './config'
import { dbFiles } from './fileStructures/dbFiles'
import { compiledFiles } from './fileStructures/compiledFiles'
import { builtFiles } from './fileStructures/builtFiles'
import { asyncForEach } from './utils'
import { Folder, File } from '../types'
import { ServiceConfig } from '@sasjs/utils/types/config'
import { create } from '../commands/create/create'

export const createTestApp = async (parentFolder: string, appName: string) => {
  process.projectDir = parentFolder
  await create(appName, '')
  process.projectDir = path.join(parentFolder, appName)
  process.currentDir = process.projectDir
}

export const createTestJobsApp = async (
  parentFolder: string,
  appName: string
) => {
  process.projectDir = parentFolder
  await create(appName, 'jobs')
  process.projectDir = path.join(parentFolder, appName)
  process.currentDir = process.projectDir
}

export const createTestMinimalApp = async (
  parentFolder: string,
  appName: string
) => {
  process.projectDir = parentFolder
  await create(appName, 'minimal')
  process.projectDir = path.join(parentFolder, appName)
  process.currentDir = process.projectDir
}

export const removeTestApp = async (parentFolder: string, appName: string) => {
  await deleteFolder(path.join(parentFolder, appName))
  process.projectDir = ''
  process.currentDir = ''
}

export const generateTestTarget = (
  targetName: string,
  appLoc: string,
  serviceConfig: ServiceConfig = {
    serviceFolders: ['sasjs/services'],
    initProgram: '',
    termProgram: '',
    macroVars: {}
  }
) => {
  dotenv.config()
  const serverType: ServerType =
    process.env.SERVER_TYPE === ServerType.SasViya
      ? ServerType.SasViya
      : ServerType.Sas9

  const target = new Target({
    name: targetName,
    serverType,
    serverUrl: process.env.SERVER_URL,
    contextName: 'SAS Studio compute context', // FIXME: should not be hard coded
    appLoc,
    authConfig: {
      client: process.env.CLIENT,
      secret: process.env.SECRET,
      access_token: process.env.ACCESS_TOKEN,
      refresh_token: process.env.REFRESH_TOKEN
    },
    jobConfig: {
      jobFolders: []
    },
    serviceConfig,
    deployConfig: {
      deployServicePack: true
    }
  })

  return target
}

export const createTestGlobalTarget = async (
  targetName: string,
  appLoc: string,
  serviceConfig: ServiceConfig = {
    serviceFolders: ['sasjs/services'],
    initProgram: '',
    termProgram: '',
    macroVars: {}
  }
) => {
  const target = generateTestTarget(targetName, appLoc, serviceConfig)

  await saveToGlobalConfig(target, false)

  return target
}

export const verifyStep = async (
  step: 'db' | 'compile' | 'build' = 'compile',
  buildFileName: string = 'viya'
) => {
  const fileStructure: Folder =
    step === 'db'
      ? dbFiles
      : step === 'compile'
      ? compiledFiles
      : step === 'build'
      ? builtFiles(buildFileName)
      : compiledFiles

  await expect(verifyFolder(fileStructure)).resolves.toEqual(true)
}

export const mockProcessExit = () =>
  jest.spyOn(process, 'exit').mockImplementation((code?: number) => {
    return code as never
  })

export const verifyFolder = async (folder: Folder, parentFolderName = '.') => {
  await expect(
    folderExists(
      path.join(process.projectDir, parentFolderName, folder.folderName)
    )
  ).resolves.toEqual(true)

  await asyncForEach(folder.files, async (file: File) => {
    await expect(
      fileExists(
        path.join(
          process.projectDir,
          parentFolderName,
          folder.folderName,
          file.fileName
        )
      )
    ).resolves.toEqual(true)
  })

  await asyncForEach(folder.subFolders, async (subFolder: Folder) => {
    await verifyFolder(
      subFolder,
      path.join(parentFolderName, folder.folderName)
    )
  })

  return true
}

export const verifyPackageJsonContent = async () => {
  const packageJsonPath = path.join(process.projectDir, 'package.json')

  await expect(fileExists(packageJsonPath)).resolves.toEqual(true)

  const packageJsonContent = await readFile(packageJsonPath)

  const packageJson = JSON.parse(packageJsonContent)

  expect(packageJson.dependencies).toEqual(
    expect.objectContaining({ '@sasjs/core': expect.anything() })
  )
  expect(packageJson.devDependencies).toEqual(
    expect.objectContaining({ ghooks: expect.anything() })
  )

  expect(
    /sasjs lint/.test(packageJson?.config?.ghooks?.['pre-commit'])
  ).toEqual(true)
}

export const removeAllTargetsFromConfigs = async () => {
  const { buildSourceFolder } = await getConstants()
  const configPath = path.join(buildSourceFolder, 'sasjs', 'sasjsconfig.json')
  const config = await getConfiguration(configPath)
  config.targets = []
  await createFile(configPath, JSON.stringify(config, null, 2))

  const globalConfig = await getGlobalRcFile()
  if (globalConfig?.targets?.length) {
    globalConfig.targets = []
    await saveGlobalRcFile(JSON.stringify(globalConfig, null, 2))
  }
}

export const updateTarget = async (
  targetJson: Partial<TargetJson>,
  targetName: string,
  isLocal: boolean = true
): Promise<Target> => {
  const config = isLocal ? await getLocalConfig() : await getGlobalRcFile()
  if (config?.targets) {
    const targetIndex = config.targets.findIndex(
      (t: TargetJson) => t.name === targetName
    )
    if (targetIndex >= 0) {
      config.targets.splice(targetIndex, 1, {
        ...config.targets[targetIndex],
        ...targetJson
      })
      isLocal
        ? await saveLocalConfigFile(JSON.stringify(config, null, 2))
        : await saveGlobalRcFile(JSON.stringify(config, null, 2))
      return new Target(config.targets[targetIndex])
    }
    throw `Unable to find Target: ${targetName}`
  }
  throw `Unable to find Target: ${targetName}`
}

export const updateConfig = async (
  config: Partial<Configuration>,
  isLocal: boolean = true
) => {
  const currentConfig = isLocal
    ? await getLocalConfig()
    : await getGlobalRcFile()

  const updatedConfig = {
    ...currentConfig,
    ...config
  }

  isLocal
    ? await saveLocalConfigFile(JSON.stringify(updatedConfig, null, 2))
    : await saveGlobalRcFile(JSON.stringify(updatedConfig, null, 2))
}

export const verifyDocs = async (
  docsFolder: string,
  target: string,
  macroCore: boolean = true
) => {
  const indexHTML = path.join(docsFolder, 'index.html')
  const appInitHTML = path.join(docsFolder, 'appinit_8sas.html')

  const sas9MacrosExampleMacro = path.join(
    docsFolder,
    'targets_2sas9_2macros_2examplemacro_8sas_source.html'
  )
  const sas9ServicesAdminDostuff = path.join(
    docsFolder,
    'targets_2sas9_2services_2admin_2dostuff_8sas_source.html'
  )
  const viyaMacrosExampleMacro = path.join(
    docsFolder,
    'targets_2viya_2macros_2examplemacro_8sas_source.html'
  )
  const viyaServicesAdminDostuff = path.join(
    docsFolder,
    'targets_2viya_2services_2admin_2dostuff_8sas_source.html'
  )
  const yetAnotherMacro = path.join(docsFolder, 'yetanothermacro_8sas.html')
  const yetAnotherMacroSource = path.join(
    docsFolder,
    'yetanothermacro_8sas_source.html'
  )
  const macroCoreFile = path.join(docsFolder, 'all_8sas.html')
  const macroCoreFileSource = path.join(docsFolder, 'all_8sas_source.html')

  await expect(folderExists(docsFolder)).resolves.toEqual(true)

  await expect(fileExists(indexHTML)).resolves.toEqual(true)
  await expect(fileExists(appInitHTML)).resolves.toEqual(true)

  const expectSas9Files = target === 'sas9'
  const expectViyaFiles = target === 'viya'

  await expect(fileExists(sas9MacrosExampleMacro)).resolves.toEqual(
    expectSas9Files
  )
  await expect(fileExists(sas9ServicesAdminDostuff)).resolves.toEqual(
    expectSas9Files
  )
  await expect(fileExists(viyaMacrosExampleMacro)).resolves.toEqual(
    expectViyaFiles
  )
  await expect(fileExists(viyaServicesAdminDostuff)).resolves.toEqual(
    expectViyaFiles
  )

  await expect(fileExists(yetAnotherMacro)).resolves.toEqual(true)
  await expect(fileExists(yetAnotherMacroSource)).resolves.toEqual(true)

  await expect(fileExists(macroCoreFile)).resolves.toEqual(macroCore)
  await expect(fileExists(macroCoreFileSource)).resolves.toEqual(macroCore)

  const indexHTMLContent = await readFile(indexHTML)

  expect(indexHTMLContent).toEqual(
    expect.stringContaining('<h1><a class="anchor" id="autotoc_md1"></a>')
  )
}

export const verifyDotFiles = async (docsFolder: string) => {
  const dotCodeFile = path.join(docsFolder, 'data_lineage.dot')
  const dotGraphFile = path.join(docsFolder, 'data_lineage.svg')

  await expect(folderExists(docsFolder)).resolves.toEqual(true)

  await expect(fileExists(dotCodeFile)).resolves.toEqual(true)
  await expect(fileExists(dotGraphFile)).resolves.toEqual(true)
}

export const verifyDotFilesNotGenerated = async (docsFolder: string) => {
  const dotCodeFile = path.join(docsFolder, 'data_lineage.dot')
  const dotGraphFile = path.join(docsFolder, 'data_lineage.svg')

  await expect(fileExists(dotCodeFile)).resolves.toEqual(false)
  await expect(fileExists(dotGraphFile)).resolves.toEqual(false)
}

export const verifyCompiledService = async (
  compiledContent: string,
  macrosToTest: string[],
  checkInit: boolean = true,
  checkTerm: boolean = true
) => {
  await verifyCompile(
    compiledContent,
    macrosToTest,
    checkInit,
    checkTerm,
    'service'
  )
}

export const verifyCompiledJob = async (
  compiledContent: string,
  macrosToTest: string[],
  checkInit: boolean = true,
  checkTerm: boolean = true
) => {
  await verifyCompile(
    compiledContent,
    macrosToTest,
    checkInit,
    checkTerm,
    'job'
  )
}

const verifyCompile = async (
  compiledContent: string,
  macrosToTest: string[],
  checkInit: boolean,
  checkTerm: boolean,
  fileType: 'job' | 'service'
) => {
  if (fileType === 'service') {
    if (checkInit) {
      expect(/\* ServiceInit start;/.test(compiledContent)).toEqual(true)
      expect(/\* ServiceInit end;/.test(compiledContent)).toEqual(true)
    }
    if (checkTerm) {
      expect(/\* ServiceTerm start;/.test(compiledContent)).toEqual(true)
      expect(/\* ServiceTerm end;/.test(compiledContent)).toEqual(true)
    }
  }

  if (fileType === 'job') {
    if (checkInit) {
      expect(/\* JobInit start;/.test(compiledContent)).toEqual(true)
      expect(/\* JobInit end;/.test(compiledContent)).toEqual(true)
    }
    if (checkTerm) {
      expect(/\* JobTerm start;/.test(compiledContent)).toEqual(true)
      expect(/\* JobTerm end;/.test(compiledContent)).toEqual(true)
    }
  }

  macrosToTest.forEach((macro) => {
    const re = new RegExp(`%macro ${macro}`)
    expect(re.test(compiledContent)).toEqual(true)
  })
}
