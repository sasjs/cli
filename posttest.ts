import path from 'path'
import { APP_NAMES } from './APPS_FOR_TESTING'
import { deleteFolder, folderExists } from '@sasjs/utils'

Object.entries(APP_NAMES)
  .map((app) => app[1])
  .forEach(async (appName) => {
    const appPath = path.join(__dirname, appName)
    if (await folderExists(appPath)) await deleteFolder(appPath)
  })
