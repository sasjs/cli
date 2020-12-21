import path from 'path'
import dotenv from 'dotenv'
import shelljs from 'shelljs'
import { copy, deleteFolder } from './file'
import { ServerType, Target } from '@sasjs/utils/types'
import { saveToGlobalConfig } from './config-utils'

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
  appLoc: string
) => {
  dotenv.config()
  const serverType: ServerType =
    process.env.SERVER_TYPE === ServerType.SasViya
      ? ServerType.SasViya
      : ServerType.Sas9

  await saveToGlobalConfig(
    new Target({
      name: targetName,
      serverType,
      serverUrl: process.env.SERVER_URL,
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
      serviceConfig: {
        serviceFolders: []
      },
      deployConfig: {
        deployServicePack: true
      }
    })
  )
}
