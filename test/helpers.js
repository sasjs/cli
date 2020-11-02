import path from 'path'

import { fileExists, folderExists } from '../src/utils/file-utils'
import { asyncForEach } from '../src/utils/utils'
import {
  getFolders,
  getGlobalRcFile,
  saveGlobalRcFile
} from '../src/utils/config-utils'
import fileStructureMinimalObj from 'files-minimal-app.json'
import fileStructureReactObj from 'files-react-app.json'
import fileStructureAngularrObj from 'files-angular-app.json'
import fileStructureDBObj from 'files-db.json'

const puppeteer = require('puppeteer')

global.browserGetAuthorizationCode = async ({
  serverUrl,
  clientId,
  username,
  password
}) => {
  const browser = await puppeteer.launch()
  const page = await browser.newPage()
  await page.goto(
    `${serverUrl}/SASLogon/oauth/authorize?client_id=${clientId}&response_type=code`
  )

  const inputUsername = await page.waitForSelector('input[name="username"]')
  await inputUsername.click()
  await page.keyboard.type(username)

  const inputPassword = await page.waitForSelector('input[name="password"]')
  await inputPassword.click()
  await page.keyboard.type(password)

  const submitButton = await page.waitForSelector('button[type="submit"]')
  await submitButton.click()

  let authHeading = await page.waitForSelector('div.infobox h3')
  let authHeadingContent = await page.evaluate(
    (heading) => heading.innerHTML,
    authHeading
  )
  if (authHeadingContent !== 'Authorization Code') {
    const openidCheckbox = await page.waitForSelector(
      'input[type="checkbox"][name="scope.0"]'
    )
    await openidCheckbox.click()

    const administrativeCheckbox = await page.waitForSelector(
      'input[type="checkbox"][name="scope.1"]'
    )
    await administrativeCheckbox.click()
    const authorizeButton = await page.waitForSelector(
      'button[name="user_oauth_approval"]'
    )
    await authorizeButton.click()

    authHeading = await page.waitForSelector('div.infobox h3')
    authHeadingContent = await page.evaluate(
      (heading) => heading.innerHTML,
      authHeading
    )
  }
  expect(authHeadingContent).toBe('Authorization Code')

  const authMessage = await page.waitForSelector('div.infobox p')
  const authMessageContent = await page.evaluate(
    (message) => message.innerHTML,
    authMessage
  )
  expect(authMessageContent).toBe(
    'Copy the following code, and paste it in your application:'
  )

  const authCode = await page.waitForSelector('div.infobox h4')
  const authCodeContent = await page.evaluate(
    (message) => message.innerHTML,
    authCode
  )

  const signOutButton = await page.waitForSelector(
    'div.infobox button[type="button"]'
  )
  await signOutButton.click()
  setTimeout(async () => {
    await browser.close()
  }, 1000)
  return authCodeContent
}

async function verifyFolderStructure(folder, parentFolderName = '.') {
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

global.verifyCreate = async ({ parentFolderName, sasonly }) => {
  const fileStructure = await getFolders(sasonly)
  let everythingPresent = false
  await asyncForEach(fileStructure, async (folder, index) => {
    everythingPresent = await verifyFolderStructure(folder, parentFolderName)
    if (everythingPresent && index === 0) {
      const configDestinationPath = path.join(
        process.projectDir,
        parentFolderName,
        folder.folderName,
        'sasjsconfig.json'
      )
      const configPresent = await fileExists(configDestinationPath)
      expect(configPresent).toEqual(true)
    }
  })
  expect(everythingPresent).toEqual(true)
}

global.verifyCreateWeb = async ({ parentFolderName, appType }) => {
  let everythingPresent = true
  const fileStructure =
    appType === 'minimal'
      ? fileStructureMinimalObj
      : appType === 'react'
      ? fileStructureReactObj
      : appType === 'angular'
      ? fileStructureAngularrObj
      : null
  await asyncForEach(fileStructure.files, async (file, index) => {
    const filePath = path.join(
      process.projectDir,
      parentFolderName,
      file.fileName
    )
    everythingPresent = everythingPresent && (await fileExists(filePath))
  })
  if (everythingPresent) {
    await asyncForEach(fileStructure.subFolders, async (folder, index) => {
      everythingPresent =
        everythingPresent &&
        (await verifyFolderStructure(folder, parentFolderName))
    })
  }
  expect(everythingPresent).toEqual(true)
}

global.verifyDB = async ({ parentFolderName }) => {
  let everythingPresent = true
  await asyncForEach(fileStructureDBObj.subFolders, async (folder, index) => {
    everythingPresent =
      everythingPresent &&
      (await verifyFolderStructure(folder, parentFolderName))
  })
  expect(everythingPresent).toEqual(true)
}

global.addToGlobalConfigs = async (buildTarget) => {
  let globalConfig = await getGlobalRcFile()
  if (globalConfig) {
    if (globalConfig.targets && globalConfig.targets.length) {
      globalConfig.targets.push(buildTarget)
    } else {
      globalConfig.targets = [buildTarget]
    }
  } else {
    globalConfig = { targets: [buildTarget] }
  }
  await saveGlobalRcFile(JSON.stringify(globalConfig, null, 2))
}
global.removeFromGlobalConfigs = async (targetName = 'cli-tests-cbd') => {
  let globalConfig = await getGlobalRcFile()
  if (globalConfig && globalConfig.targets && globalConfig.targets.length) {
    const targets = globalConfig.targets.filter((t) => t.name !== targetName)
    await saveGlobalRcFile(JSON.stringify({ targets }, null, 2))
  }
}
