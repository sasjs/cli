import fs from 'fs'
import path from 'path'
import dotenv from 'dotenv'
import {
  createFile,
  deleteFolder,
  fileExists,
  folderExists,
  generateTimestamp,
  readFile,
  asyncForEach,
  listFilesAndSubFoldersInFolder,
  pathSepEscaped
} from '@sasjs/utils'
import { deleteFolder as deleteServerFolder } from '../commands/folder/delete'
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
  getGlobalRcFile,
  saveGlobalRcFile,
  saveToGlobalConfig,
  getAccessToken,
  getSASjs
} from './config'
import { dbFiles } from './fileStructures/dbFiles'
import { compiledFiles } from './fileStructures/compiledFiles'
import { compiledFilesCustom1 } from './fileStructures/compiledFilesCustom1'
import { builtFiles } from './fileStructures/builtFiles'
import { builtFilesCustom1 } from './fileStructures/builtFilesCustom1'
import { Folder, File } from '../types'
import { ServiceConfig, JobConfig } from '@sasjs/utils/types/config'
import { create } from '../commands/create/create'
import { setConstants, contextName } from './setConstants'
import { Constants } from '../constants'
import * as shell from './shell'

/**
 * A name for a test app or output folder that two specs cannot collide on.
 *
 * `generateTimestamp()` is second-resolution - year, month, day, hour, minute,
 * second, and nothing finer - so two specs in one directory starting within the
 * same second build the same folder name and clobber each other, which is what
 * the docs specs do whenever jest runs them in parallel. The milliseconds and a
 * short random suffix make that impossible while keeping the name readable.
 */
export const generateUniqueTimestamp = () =>
  `${generateTimestamp()}-${Date.now() % 1000}-${Math.random()
    .toString(36)
    .slice(2, 7)}`

/**
 * Every npm command the stub has answered, in order - so a spec can assert the
 * command the CLI issued, not only the package.json it left behind.
 */
export const npmCommands: string[] = []

/**
 * Answers the npm commands `create` and `init` issue, and runs everything else
 * for real.
 *
 * Scaffolding an app shells out to npm three ways: `npm init` (about 0.6s), an
 * install of @sasjs/core (about 1.3s) and, for a seed app, that app's whole
 * dependency tree (about 3s for minimal, 27s for react). Every spec that
 * creates an app pays all of it, again and again, and every one of those calls
 * needs the registry to answer - so the "mocked" suite is neither fast nor
 * offline.
 *
 * None of it is the CLI's own behaviour. The CLI owns the command it issues and
 * the package.json a project is left with, so the stub answers those three
 * commands with exactly that effect and records them in `npmCommands`; every
 * other command - the template downloads, compiles, builds and docs - still runs
 * for real.
 *
 * Call it where the app is created: from `beforeEach`, or from a helper that
 * runs there. Jest restores spies before each test, so a stub installed in
 * `beforeAll` is gone before the first test body runs.
 */
export const stubNpm = () => {
  if (jest.isMockFunction(shell.exec)) return

  const realExec = shell.exec

  jest
    .spyOn(shell, 'exec')
    .mockImplementation((command: string, options: shell.ExecOptions = {}) => {
      const call = npmCall(command)

      if (!call) return realExec(command, options)

      npmCommands.push(call.command)
      call.run()

      return { stdout: '', stderr: '', code: 0 }
    })
}

/**
 * Parses one of the CLI's shell commands into the npm call it stands for, or
 * null when it is a command that must really run.
 */
const npmCall = (
  command: string
): { command: string; run: () => void } | null => {
  // Every npm command is issued as `cd "<folder>" && npm ...`.
  const parsed = /^cd "([^"]+)" && (npm .*)$/.exec(command)

  if (!parsed) return null

  const [, folder, npm] = parsed

  if (/^npm init\b/.test(npm))
    return { command: npm, run: () => writePackageJson(folder) }

  if (/^npm i(nstall)? @sasjs\/core\b/.test(npm))
    return { command: npm, run: () => addCoreDependency(folder) }

  // A seed app's own tree. The template's package.json already declares it and
  // no spec reads node_modules, so there is nothing here to install.
  if (/^npm install$/.test(npm)) return { command: npm, run: () => {} }

  return null
}

/** The package.json `npm init --yes` writes into an otherwise empty folder. */
const writePackageJson = (folder: string) => {
  const filePath = path.join(folder, 'package.json')

  if (fs.existsSync(filePath)) return

  fs.writeFileSync(
    filePath,
    JSON.stringify(
      {
        name: path.basename(folder),
        version: '1.0.0',
        description: '',
        main: 'index.js',
        scripts: { test: 'echo "Error: no test specified" && exit 1' },
        keywords: [],
        author: '',
        license: 'ISC'
      },
      null,
      2
    )
  )
}

/** What `npm i @sasjs/core --save` does to package.json and the lockfile. */
const addCoreDependency = (folder: string) => {
  const filePath = path.join(folder, 'package.json')
  const packageJson = fs.existsSync(filePath)
    ? JSON.parse(fs.readFileSync(filePath, 'utf8'))
    : {}

  packageJson.dependencies = {
    ...(packageJson.dependencies || {}),
    // The range the CLI itself declares. Any range satisfies the specs, and
    // reading it here means the stub cannot drift from the package it tests.
    '@sasjs/core': cliPackageJson().dependencies['@sasjs/core']
  }

  fs.writeFileSync(filePath, JSON.stringify(packageJson, null, 2))

  // An install leaves a lockfile behind, and specs assert on its presence.
  fs.writeFileSync(
    path.join(folder, 'package-lock.json'),
    JSON.stringify(
      {
        name: packageJson.name,
        version: packageJson.version,
        lockfileVersion: 3,
        requires: true,
        packages: {
          '': {
            name: packageJson.name,
            version: packageJson.version,
            dependencies: packageJson.dependencies
          }
        }
      },
      null,
      2
    )
  )
}

const cliPackageJson = () =>
  JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8')
  )

export const createTestApp = async (parentFolder: string, appName: string) => {
  stubNpm()
  process.projectDir = parentFolder
  await create(appName, '')
  process.projectDir = path.join(parentFolder, appName)
  process.currentDir = process.projectDir
  process.sasjsConfig = await getLocalConfig()
  await setConstants()
}

export const createTestJobsApp = async (
  parentFolder: string,
  appName: string
) => {
  stubNpm()
  process.projectDir = parentFolder
  await create(appName, 'jobs')
  process.projectDir = path.join(parentFolder, appName)
  process.currentDir = process.projectDir
  process.sasjsConfig = await getLocalConfig()
  await setConstants()
  await updateTarget({ serverUrl: 'https://example.com' }, 'viya')
}

export const createTestMinimalApp = async (
  parentFolder: string,
  appName: string
) => {
  stubNpm()
  process.projectDir = parentFolder
  await create(appName, 'minimal')
  process.projectDir = path.join(parentFolder, appName)
  process.currentDir = process.projectDir
  process.sasjsConfig = await getLocalConfig()
  await setConstants()
}

export const removeTestApp = async (parentFolder: string, appName: string) => {
  await deleteFolder(path.join(parentFolder, appName))

  process.projectDir = ''
  process.currentDir = ''
  process.sasjsConstants = undefined as any as Constants
}

export const removeTestServerFolder = async (
  folderPath: string,
  target: Target
) => {
  // We do not have a way of deleting server folders with SAS9 yet
  if (target.serverType === ServerType.Sas9) {
    return
  }

  const sasjs = getSASjs(target)

  // getAccessToken is fine here (unlike in a real command) since this is a
  // one-shot, same-process cleanup call - no later invocation depends on the
  // refresh token this leaves on disk. See getAccessToken's doc in config.ts.
  const accessToken = await getAccessToken(target)

  await deleteServerFolder(folderPath, sasjs, accessToken)
}

export const generateTestTarget = (
  targetName: string,
  appLoc: string,
  serviceConfig: ServiceConfig = {
    serviceFolders: [path.join('sasjs', 'services')],
    initProgram: '',
    termProgram: '',
    macroVars: {}
  },
  serverType = ServerType.SasViya,
  jobConfig: JobConfig = {
    jobFolders: [],
    initProgram: '',
    termProgram: '',
    macroVars: {}
  }
) => {
  dotenv.config()

  let serverUrl = process.env.SASJS_SERVER_URL

  if (serverType === ServerType.SasViya) serverUrl = process.env.VIYA_SERVER_URL

  if (serverType === ServerType.Sas9) serverUrl = process.env.SAS9_SERVER_URL

  const target = new Target({
    name: targetName,
    serverType,
    serverUrl: serverUrl as string,
    contextName,
    appLoc,
    authConfig: {
      client: process.env.CLIENT,
      secret: process.env.SECRET,
      access_token: process.env.ACCESS_TOKEN,
      refresh_token: process.env.REFRESH_TOKEN
    },
    jobConfig,
    serviceConfig,
    testConfig: {
      initProgram: path.join('tests', 'testinit.sas'),
      termProgram: path.join('tests', 'testterm.sas'),
      macroVars: {
        testsuite: 'SASjs Test Template'
      },
      testSetUp: path.join('tests', 'testsetup.sas'),
      testTearDown: path.join('tests', 'sub', 'testteardown.sas')
    },
    buildConfig: {
      buildOutputFileName: `${targetName}.sas`
    },
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
    serviceFolders: [path.join('sasjs', 'services')],
    initProgram: '',
    termProgram: '',
    macroVars: {}
  },
  serverType = ServerType.SasViya
) => {
  const target = generateTestTarget(
    targetName,
    appLoc,
    serviceConfig,
    serverType
  )

  await saveToGlobalConfig(target, false)

  return target
}

export const verifyStep = async (
  step: 'db' | 'compile' | 'build' = 'compile',
  buildFileName: string = 'viya',
  customFiles: 'custom' | 'no' = 'no'
) => {
  const fileStructure: Folder =
    step === 'db'
      ? dbFiles
      : step === 'compile'
        ? customFiles === 'no'
          ? compiledFiles
          : compiledFilesCustom1
        : step === 'build'
          ? customFiles === 'no'
            ? builtFiles(buildFileName)
            : builtFilesCustom1(buildFileName)
          : compiledFiles

  await expect(verifyFolder(fileStructure)).resolves.toEqual(true)

  if (step === 'build') {
    const buildJsonFilePath = path.join(
      process.projectDir,
      'sasjsbuild',
      `${buildFileName}.json`
    )
    const buildJson = JSON.parse(await readFile(buildJsonFilePath))

    const buildSasFilePath = path.join(
      process.projectDir,
      'sasjsbuild',
      `${buildFileName}.sas`
    )
    const buildSas = await readFile(buildSasFilePath)

    expect(
      verifyBuildJson(fileStructure.subFolders, buildJson.members, buildSas)
    ).toEqual(true)
  }
}

export const mockProcessExit = () =>
  jest
    .spyOn(process, 'exit')
    .mockImplementation((code?: string | number | null | undefined) => {
      return code as never
    })

interface BuildJson {
  name: string
  type: string
  code?: string
  members?: BuildJson[]
}

const verifyBuildJson = (
  folders: Folder[],
  buildJson: BuildJson[] = [],
  buildSas: string
) => {
  folders.forEach((folder) => {
    const folderFound = buildJson
      .filter((buildMember) => buildMember.type === 'folder')
      .find((buildMember) => buildMember.name === folder.folderName)

    expect(folderFound).toBeTruthy()

    folder.files.forEach((file) => {
      const fileFound = folderFound!
        .members!.filter((buildMember) => buildMember.type === 'service')
        .find(
          (buildMember) =>
            buildMember.name === file.fileName.replace(/.sas$/, '')
        )

      expect(fileFound).toBeTruthy()

      expect(buildSas).toEqual(
        expect.stringContaining(`%let service=${fileFound!.name};`)
      )
    })

    expect(
      verifyBuildJson(folder.subFolders, folderFound!.members, buildSas)
    ).toEqual(true)
  })

  return true
}

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

export const verifyPackageJsonContent = async (parentFolderName = '.') => {
  const packageJsonPath = path.join(
    process.projectDir,
    parentFolderName,
    'package.json'
  )

  await expect(fileExists(packageJsonPath)).resolves.toEqual(true)

  const packageJsonContent = await readFile(packageJsonPath)

  const packageJson = JSON.parse(packageJsonContent)

  expect(
    parentFolderName.includes('minimal')
      ? packageJson.devDependencies
      : packageJson.dependencies
  ).toEqual(expect.objectContaining({ '@sasjs/core': expect.anything() }))
}

export const removeAllTargetsFromConfigs = async () => {
  const { buildSourceFolder } = process.sasjsConstants
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
  let config = isLocal ? await getLocalConfig() : await getGlobalRcFile()

  if (config?.targets) {
    const targetIndex = config.targets.findIndex(
      (t: TargetJson) => t.name === targetName
    )
    if (targetIndex >= 0) {
      config.targets.splice(targetIndex, 1, {
        ...config.targets[targetIndex],
        ...targetJson
      })

      config = {
        ...config,
        targets: config.targets.map((target: Target) => ({
          ...target,
          serverUrl:
            process.env[
              `${
                target.serverType === ServerType.SasViya
                  ? 'VIYA'
                  : target.serverType
              }_SERVER_URL`
            ]
        }))
      }

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
  const macroCoreFile = path.join(docsFolder, 'mf__existds_8sas.html')
  const macroCoreFileSource = path.join(
    docsFolder,
    'mf__existds_8sas_source.html'
  )

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

  expect(indexHTMLContent).toEqual(expect.stringMatching(/Contributing/))
  expect(indexHTMLContent).toEqual(expect.stringMatching(/Environment Setup/))
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

export const verifyGitNotPresent = async (folder: string) => {
  const gitFolderOrModules = (
    await listFilesAndSubFoldersInFolder(folder, true)
  ).filter(
    (sub: string) =>
      /\.git$/.test(sub) ||
      new RegExp(`\.git${pathSepEscaped}`).test(sub) ||
      /\.gitmodules/.test(sub)
  )

  expect(gitFolderOrModules.length).toEqual(0)
}
