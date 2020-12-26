import path from 'path'
import { processContext } from '../..'
import {
  sanitizeFileName,
  readFile,
  createFile,
  deleteFolder
} from '../../../utils/file'
import { generateTimestamp } from '../../../utils/utils'
import { removeFromGlobalConfig } from '../../../utils/config-utils'
import { Command } from '../../../utils/command'
import { createTestGlobalTarget } from '../../../utils/test'

let contexts: any[]
let testContextConfig: any
let testContextConfigFile: string
let testContextConfigPath: string

describe('sasjs context', () => {
  const timestamp = generateTimestamp()
  const targetName = `cli-tests-context-${timestamp}`

  beforeAll(async () => {
    await createTestGlobalTarget(targetName, '/Public/app/cli-tests')
    process.projectDir = process.cwd()
  })

  afterAll(async () => {
    deleteFolder(testContextConfigPath)
    await removeFromGlobalConfig(targetName)
  })

  describe('list', () => {
    it(
      'should list accessible compute contexts',
      async () => {
        contexts = (await processContext(
          new Command(`context list -t ${targetName}`)
        )) as {
          createdBy: any
          id: any
          name: any
          version: any
          sysUserId: any
        }[]

        expect(contexts.length).toBeGreaterThan(0)
      },
      60 * 4 * 1000
    )
  })

  describe('exportContext', () => {
    it(
      'should export a compute context',
      async () => {
        const contextName = contexts[0].name
        const command = new Command(
          `context export ${contextName} -t ${targetName}`
        )

        await expect(processContext(command)).resolves.toEqual(true)
      },
      60 * 1000
    )
  })

  describe('create', () => {
    it(
      'should create a compute context',
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

        const command = new Command(
          `context create -s ${testContextConfigFile} -t targetName`
        )

        await expect(processContext(command)).resolves.toEqual(true)
      },
      60 * 1000
    )
  })

  describe('edit', () => {
    it(
      'should edit a compute context',
      async () => {
        testContextConfig.description += '_updated'

        const contextConfig = JSON.stringify(testContextConfig, null, 2)

        await createFile(testContextConfigPath, contextConfig)

        const command = new Command(
          `context edit ${testContextConfig.name} -s ${testContextConfigFile} -t ${targetName}`
        )

        await expect(processContext(command)).resolves.toEqual(true)
      },
      60 * 1000
    )
  })

  describe('delete', () => {
    it(
      'should delete a compute context',
      async () => {
        const command = new Command(
          `context delete ${testContextConfig.name} -t targetName`
        )

        await expect(processContext(command)).resolves.toEqual(true)
      },
      60 * 1000
    )
  })
})
