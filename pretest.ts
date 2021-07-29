import path from 'path'
import shelljs from 'shelljs'

import {
  createTestJobsApp,
  createTestMinimalApp,
  APP_NAMES
} from './src/utils/test'
import { folderExists } from '@sasjs/utils'

const createInitialCommit = (folderPath: string) => {
  shelljs.exec(
    `cd ${folderPath} && ` +
      `git config user.email "sasjs-cli@github.com" && ` +
      `git config user.name "SASjs CLI" && ` +
      `git add . && ` +
      `git commit -m "chore: initial commit by cli"`,
    {
      silent: true
    }
  )
}

const setupJobTemplateApp = async () => {
  if (await folderExists(path.join(__dirname, APP_NAMES.JOB_TEMPLATE_APP)))
    return
  await createTestJobsApp(__dirname, APP_NAMES.JOB_TEMPLATE_APP)
  createInitialCommit(process.projectDir)
}

const setupMinimalSeedApp = async () => {
  if (await folderExists(path.join(__dirname, APP_NAMES.MINIMAL_SEED_APP)))
    return
  await createTestMinimalApp(__dirname, APP_NAMES.MINIMAL_SEED_APP)
  createInitialCommit(process.projectDir)
}

;(async () => {
  await setupJobTemplateApp()
  await setupMinimalSeedApp()
})()
