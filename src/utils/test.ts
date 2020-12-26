import path from 'path'
import dotenv from 'dotenv'
import shelljs from 'shelljs'
import { copy, deleteFolder, fileExists, folderExists } from './file'
import { ServerType, Target } from '@sasjs/utils/types'
import { saveToGlobalConfig } from './config-utils'
import fileStructureDBObj from './fileStructures/files-db.json'
import fileStructureCompileObj from './fileStructures/files-compiled.json'
import fileStructureBuildObj from './fileStructures/files-built.json'
import { asyncForEach } from './utils'
import { Folder } from '../types'
import { ServiceConfig } from '@sasjs/utils/types/config'

interface VerifyStepInput {
  parentFolderName: string
  step: string
}

export const createTestApp = async (parentFolder: string, appName: string) => {
  await copy(
    path.join(__dirname, 'testProject'),
    path.join(parentFolder, appName)
  )
  shelljs.exec(`cd ${path.join(parentFolder, appName)} && npm install`, {
    silent: true
  })
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
    serviceFolders: [],
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

export const verifyStep = async (input: VerifyStepInput) => {
  const { parentFolderName, step } = input
  let everythingPresent = true
  const fileStructure =
    step === 'db'
      ? fileStructureDBObj
      : step === 'compile'
      ? fileStructureCompileObj
      : step === 'build'
      ? fileStructureBuildObj
      : null

  const fileStructureClone = JSON.parse(JSON.stringify(fileStructure))

  await asyncForEach(fileStructureClone.subFolders, async (folder, index) => {
    everythingPresent =
      everythingPresent &&
      (await verifyFolderStructure(folder, parentFolderName))
  })
  expect(everythingPresent).toEqual(true)
}

export const verifyFolderStructure = async (
  folder: Folder,
  parentFolderName = '.'
) => {
  let everythingPresent = false
  let folderPath = path.join(process.projectDir, folder.folderName)
  if (parentFolderName) {
    folderPath = path.join(
      process.projectDir,
      parentFolderName,
      folder.folderName
    )
  }
  if (await folderExists(folderPath)) {
    everythingPresent = true
    if (folder.files && folder.files.length) {
      let filesPresent = true
      await asyncForEach(folder.files, async (file) => {
        const filePath = path.join(
          process.projectDir,
          parentFolderName,
          `${folder.folderName}/${file.fileName}`
        )
        filesPresent = filesPresent && (await fileExists(filePath))
      })
      everythingPresent = filesPresent
    }
    if (everythingPresent && folder.subFolders && folder.subFolders.length) {
      let subfoldersPresent = true
      await asyncForEach(folder.subFolders, async (subFolder) => {
        subFolder.folderName = `${
          parentFolderName ? parentFolderName + '/' : ''
        }${folder.folderName}/${subFolder.folderName}`

        subfoldersPresent =
          subfoldersPresent && (await verifyFolderStructure(subFolder))
      })
      everythingPresent = subfoldersPresent
    }
  }
  return everythingPresent
}
