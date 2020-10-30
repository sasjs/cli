import dotenv from 'dotenv'
import path from 'path'
import { add } from '../../../src/main'

import {
  getConfiguration,
  getGlobalRcFile
} from '../../../src/utils/config-utils'
import { deleteFolder } from '../../../src/utils/file-utils'
import { generateTimestamp } from '../../../src/utils/utils'

describe('sasjs add', () => {
  const testingAppFolder = 'testing-apps-add'
  let stdin

  beforeAll(async () => {
    process.projectDir = path.join(process.cwd(), testingAppFolder)
    dotenv.config()
    stdin = require('mock-stdin').stdin()
  })

  describe('add', () => {
    it(
      'should lets the user to add a build target to localConfig',
      async () => {
        const timestamp = generateTimestamp()

        const serverUrl = process.env.SERVER_URL
        const tgtName = `test-viya-${timestamp}`
        const username = process.env.SAS_USERNAME
        const password = process.env.SAS_PASSWORD
        const clientId = process.env.CLIENT
        const secretId = process.env.SECRET
        setTimeout(async () => {
          stdin.send(['\r'])
          stdin.send(['\r'])
          stdin.send([`${tgtName}\r`])
          stdin.send(['\r'])
          stdin.send([`${serverUrl}\r`])
          stdin.send([`${clientId}\r`])
          stdin.send([`${secretId}\r`])

          const authCodeContent = await browserGetAuthorizationCode({
            serverUrl,
            clientId,
            username,
            password
          })

          stdin.send([`${authCodeContent}\r`])
          stdin.send([`1\r`])
        }, 1000)
        await expect(add()).resolves.toEqual(true)

        const buildSourceFolder = require('../../../src/constants')
          .buildSourceFolder
        const config = await getConfiguration(
          path.join(buildSourceFolder, 'sasjsconfig.json')
        )

        expect(config).toEqual(expect.anything())
        expect(config.targets).toEqual(expect.anything())

        const target = config.targets.find((t) => t.name === tgtName)

        expect(target).toEqual(expect.anything())
        expect(target.tgtBuildVars.client).toEqual(clientId)
        expect(target.tgtBuildVars.secret).toEqual(secretId)
        expect(target.tgtDeployVars.client).toEqual(clientId)
        expect(target.tgtDeployVars.secret).toEqual(secretId)
      },
      60 * 1000
    )
    it(
      'should lets the user to add a build target to globalConfig',
      async () => {
        const timestamp = generateTimestamp()

        const serverUrl = process.env.SERVER_URL
        const tgtName = `test-viya-${timestamp}`
        const username = process.env.SAS_USERNAME
        const password = process.env.SAS_PASSWORD
        const clientId = process.env.CLIENT
        const secretId = process.env.SECRET
        setTimeout(async () => {
          stdin.send(['2\r'])
          stdin.send(['\r'])
          stdin.send([`${tgtName}\r`])
          stdin.send(['\r'])
          stdin.send([`${serverUrl}\r`])
          stdin.send([`${clientId}\r`])
          stdin.send([`${secretId}\r`])

          const authCodeContent = await browserGetAuthorizationCode({
            serverUrl,
            clientId,
            username,
            password
          })

          stdin.send([`${authCodeContent}\r`])
          stdin.send([`1\r`])
        }, 1000)
        await expect(add()).resolves.toEqual(true)
        const config = await getGlobalRcFile()

        expect(config).toEqual(expect.anything())
        expect(config.targets).toEqual(expect.anything())

        const target = config.targets.find((t) => t.name === tgtName)

        expect(target).toEqual(expect.anything())
        expect(target.tgtBuildVars.client).toEqual(clientId)
        expect(target.tgtBuildVars.secret).toEqual(secretId)
        expect(target.tgtDeployVars.client).toEqual(clientId)
        expect(target.tgtDeployVars.secret).toEqual(secretId)

        await removeFromGlobalConfigs(tgtName)
      },
      60 * 1000
    )
  })

  afterEach(async () => {
    const sasjsDirPath = path.join(process.projectDir, 'sasjs')
    await deleteFolder(sasjsDirPath)
  }, 60 * 1000)
  afterAll(async () => {
    const projectDirPath = path.join(process.projectDir)
    await deleteFolder(projectDirPath)
  }, 60 * 1000)
})
