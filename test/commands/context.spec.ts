import dotenv from 'dotenv'
import path from 'path'
import { processContext } from '../../src/commands'
import {
  sanitizeFileName,
  readFile,
  createFile,
  deleteFolder
} from '../../src/utils/file'
import { ServerType } from '@sasjs/utils/types'

let contexts: [any]
let testContextConfig: any
let testContextConfigFile: string
let testContextConfigPath: string

describe('sasjs context', () => {
  const targetName = 'cli-tests-context'

  beforeAll(async () => {
    dotenv.config()
    const serverType: ServerType =
      process.env.SERVER_TYPE === ServerType.SasViya
        ? ServerType.SasViya
        : ServerType.Sas9
    await addToGlobalConfigs({
      name: targetName,
      serverType: ServerType,
      serverUrl: process.env.SERVER_URL as string,
      appLoc: '/Public/app/cli-tests',
      authInfo: {
        client: process.env.CLIENT as string,
        secret: process.env.SECRET as string,
        access_token: process.env.ACCESS_TOKEN as string,
        refresh_token: process.env.REFRESH_TOKEN as string
      }
    })

    process.projectDir = path.join(process.cwd())
  })

  describe('list', () => {
    it(
      'should list accessible compute contexts',
      async () => {
        contexts = await processContext(`context list -t ${targetName}`)

        expect(contexts.length).toBeGreaterThan(0)
      },
      60 * 4 * 1000
    )
  })

  describe('exportContext', () => {
    it(
      'should exports compute context',
      async () => {
        const contextName = contexts[0].name
        const command = `context export ${contextName} -t ${targetName}`

        await expect(processContext(command)).resolves.toEqual(true)
      },
      60 * 1000
    )
  })

  describe('create', () => {
    it(
      'should create compute context',
      async () => {
        testContextConfigFile = sanitizeFileName(contexts[0].name) + '.json'
        testContextConfigPath = path.join(process.cwd(), testContextConfigFile)

        let contextConfig = await readFile(testContextConfigPath)

        testContextConfig = JSON.parse(contextConfig)
        testContextConfig.name += '_' + Date.now()

        if (!testContextConfig.attributes) {
          testContextConfig.attributes = { runServerAs: 'cas' }
        }

        contextConfig = JSON.stringify(testContextConfig, null, 2)

        await createFile(testContextConfigPath, contextConfig)

        const command = `context create -s ${testContextConfigFile} -t targetName`

        await expect(processContext(command)).resolves.toEqual(true)
      },
      60 * 1000
    )
  })

  describe('edit', () => {
    it(
      'should edit compute context',
      async () => {
        testContextConfig.description += '_updated'

        const contextConfig = JSON.stringify(testContextConfig, null, 2)

        await createFile(testContextConfigPath, contextConfig)

        const command = `context edit ${testContextConfig.name} -s ${testContextConfigFile} -t ${targetName}`

        await expect(processContext(command)).resolves.toEqual(true)
      },
      60 * 1000
    )
  })

  describe('delete', () => {
    it(
      'should delete compute context',
      async () => {
        const command = `context delete ${testContextConfig.name} -t targetName`

        await expect(processContext(command)).resolves.toEqual(true)
      },
      60 * 1000
    )
  })

  afterAll(async () => {
    deleteFolder(testContextConfigPath)
    await removeFromGlobalConfigs(targetName)
  })
})
