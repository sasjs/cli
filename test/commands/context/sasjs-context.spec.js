import dotenv from 'dotenv'
import path from 'path'
import { processContext } from '../../../src/sasjs-context/index'
import {
  sanitizeFileName,
  readFile,
  createFile
} from '../../../src/utils/file-utils'

let contexts
let testContextConfig
let testContextConfigFile
let testContextConfigPath

describe('sasjs context', () => {
  const targetName = 'cli-tests-context'
  beforeAll(async () => {
    dotenv.config()
    await addToGlobalConfigs({
      name: targetName,
      serverType: process.env.SERVER_TYPE,
      serverUrl: process.env.SERVER_URL,
      appLoc: '/Public/app/cli-tests',
      authInfo: {
        client: process.env.CLIENT,
        secret: process.env.SECRET,
        access_token: process.env.ACCESS_TOKEN,
        refresh_token: process.env.REFRESH_TOKEN
      }
    })

    process.projectDir = path.join(process.cwd())
  })

  describe('list', () => {
    it(
      'should list accessible compute contexts',
      async () => {
        const command = ['context', 'list', '-t', targetName]

        contexts = await processContext(command)

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
        const command = ['context', 'export', contextName, '-t', targetName]

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

        const command = [
          'context',
          'create',
          '-s',
          testContextConfigFile,
          '-t',
          targetName
        ]

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

        const command = [
          'context',
          'edit',
          ...testContextConfig.name.split(' '),
          '-s',
          testContextConfigFile,
          '-t',
          targetName
        ]

        await expect(processContext(command)).resolves.toEqual(true)
      },
      60 * 1000
    )
  })

  describe('delete', () => {
    it(
      'should delete compute context',
      async () => {
        const command = [
          'context',
          'delete',
          ...testContextConfig.name.split(' '),
          '-t',
          targetName
        ]

        await expect(processContext(command)).resolves.toEqual(true)
      },
      60 * 1000
    )
  })

  afterAll(async () => {
    await removeFromGlobalConfigs(targetName)
  })
})
