import path from 'path'
import dotenv from 'dotenv'
import {
  createFile,
  deleteFolder,
  fileExists,
  folderExists,
  readFile
} from './file'
import { ServerType, Target } from '@sasjs/utils/types'
import { saveToGlobalConfig } from './config'
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
}

export const createTestMinimalApp = async (
  parentFolder: string,
  appName: string
) => {
  process.projectDir = parentFolder
  await create(appName, 'minimal')
  process.projectDir = path.join(parentFolder, appName)
}

export const removeTestApp = async (parentFolder: string, appName: string) => {
  await deleteFolder(path.join(parentFolder, appName))
  process.projectDir = ''
}

export const createTestGlobalTarget = async (
  targetName: string,
  appLoc: string,
  serviceConfig: ServiceConfig = {
    serviceFolders: ['services'],
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

  await saveToGlobalConfig(target)

  return target
}

const createLocalTarget = async (
  targetName: string,
  serviceConfig = {
    serviceFolders: ['services'],
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
    serverUrl: process.env.SERVER_URL as string,
    appLoc: `/Public/app/cli-tests/${targetName}`,
    serviceConfig,
    jobConfig: {
      jobFolders: [],
      initProgram: '',
      termProgram: '',
      macroVars: {}
    },
    deployConfig: {
      deployServicePack: true,
      deployScripts: []
    }
  })

  const configContent = await readFile(
    path.join(process.projectDir, 'sasjs', 'sasjsconfig.json')
  )

  const configJSON = JSON.parse(configContent)
  configJSON.targets = [
    {
      ...target.toJson(),
      deployConfig: {
        deployScripts: ['sasjs/build/copyscript.sh'],
        deployServicePack: true
      }
    }
  ]

  await createFile(
    path.join(process.projectDir, 'sasjs', 'sasjsconfig.json'),
    JSON.stringify(configJSON, null, 2)
  )

  return target
}

export const verifyStep = async (
  step: 'db' | 'compile' | 'build' = 'compile'
) => {
  let everythingPresent = false
  const fileStructure: Folder =
    step === 'db'
      ? dbFiles
      : step === 'compile'
      ? compiledFiles
      : step === 'build'
      ? builtFiles
      : compiledFiles

  everythingPresent = await verifyFolder(fileStructure)

  expect(everythingPresent).toEqual(true)
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
