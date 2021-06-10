import path from 'path'
import { processContext } from '../..'
import { readFile, createFile, deleteFolder } from '@sasjs/utils'
import { sanitizeFileName } from '../../../utils/file'
import SASjs from '@sasjs/adapter/node'
import { generateTimestamp } from '@sasjs/utils'
import { removeFromGlobalConfig } from '../../../utils/config'
import { Command } from '../../../utils/command'
import { createTestGlobalTarget } from '../../../utils/test'

let contexts: any[]
let testContextConfig: any
let testContextConfigFile: string
let testContextConfigPath: string
let originalTestContextConfigName: string
const sasjs = new SASjs()
const defaultComputeContexts = sasjs.getDefaultComputeContexts()
const setDefaultContextName = () => {
  originalTestContextConfigName = testContextConfig.name

  testContextConfig.name =
    defaultComputeContexts[
      Math.floor(Math.random() * defaultComputeContexts.length)
    ]
}
const restoreTestContextName = () => {
  testContextConfig.name = originalTestContextConfigName
}
const defaultContextError = (action: string) =>
  new Error(
    `${action} default SAS compute contexts is not allowed.\nDefault contexts:${defaultComputeContexts.map(
      (context, i) => `\n${i + 1}. ${context}`
    )}`
  )

describe('sasjs context', () => {
  const timestamp = generateTimestamp()
  const targetName = `cli-tests-context-${timestamp}`

  beforeAll(async () => {
    await createTestGlobalTarget(
      targetName,
      `/Public/app/cli-tests/${targetName}`
    )
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
    it('should export a compute context', async (done) => {
      const contextName = contexts[0].name
      const command = new Command(
        `context export ${contextName} -t ${targetName}`
      )

      await expect(processContext(command)).resolves.toEqual(true)

      done()
    })
  })

  describe('create', () => {
    it('should create a compute context', async (done) => {
      testContextConfigFile = sanitizeFileName(contexts[0].name) + '.json'
      testContextConfigPath = path.join(process.cwd(), testContextConfigFile)

      let contextConfig = await readFile(testContextConfigPath)

      testContextConfig = JSON.parse(contextConfig)
      testContextConfig = {
        ...testContextConfig,
        launchContext: {
          contextName: 'CLI Unit Tests launcher context'
        }
      }
      testContextConfig.name += '_' + Date.now()

      if (!testContextConfig.attributes) {
        testContextConfig.attributes = { runServerAs: 'cas' }
      }

      contextConfig = JSON.stringify(testContextConfig, null, 2)

      await createFile(testContextConfigPath, contextConfig)

      const command = new Command(
        `context create -s ${testContextConfigFile} -t ${targetName}`
      )

      await expect(processContext(command)).resolves.toEqual(true)

      done()
    })

    it('should return an error if trying to create compute context that already exists', async (done) => {
      testContextConfigFile = sanitizeFileName(contexts[0].name) + '.json'
      testContextConfigPath = path.join(process.cwd(), testContextConfigFile)

      let contextConfig = await readFile(testContextConfigPath)

      testContextConfig = JSON.parse(contextConfig)
      testContextConfig = {
        ...testContextConfig,
        launchContext: {
          contextName: 'CLI Unit Tests launcher context'
        }
      }

      if (!testContextConfig.attributes) {
        testContextConfig.attributes = { runServerAs: 'cas' }
      }

      contextConfig = JSON.stringify(testContextConfig, null, 2)

      await createFile(testContextConfigPath, contextConfig)

      const command = new Command(
        `context create -s ${testContextConfigFile} -t ${targetName}`
      )

      await expect(processContext(command)).resolves.toEqual(
        new Error(`Compute context '${testContextConfig.name}' already exists.`)
      )

      done()
    })
  })

  describe('edit', () => {
    it('should return an error if trying to edit default compute context', async (done) => {
      testContextConfig.description += '_updated'

      setDefaultContextName()

      const contextConfig = JSON.stringify(testContextConfig, null, 2)

      await createFile(testContextConfigPath, contextConfig)

      const command = new Command(
        `context edit ${testContextConfig.name} -s ${testContextConfigFile} -t ${targetName}`
      )

      await expect(processContext(command)).resolves.toEqual(
        defaultContextError('Editing')
      )

      restoreTestContextName()

      done()
    })

    it('should edit compute context', async (done) => {
      testContextConfig.description += '_updated'

      const contextConfig = JSON.stringify(testContextConfig, null, 2)

      await createFile(testContextConfigPath, contextConfig)

      const command = new Command(
        `context edit ${testContextConfig.name} -s ${testContextConfigFile} -t ${targetName}`
      )

      await expect(processContext(command)).resolves.toEqual(true)

      done()
    })
  })

  describe('delete', () => {
    it('should return an error if trying to delete default compute context', async (done) => {
      setDefaultContextName()

      const command = new Command(
        `context delete ${testContextConfig.name} -t ${targetName}`
      )

      await expect(processContext(command)).resolves.toEqual(
        defaultContextError('Deleting')
      )

      restoreTestContextName()

      done()
    })

    it('should delete compute context', async (done) => {
      const command = new Command(
        `context delete ${testContextConfig.name} -t ${targetName}`
      )

      await expect(processContext(command)).resolves.toEqual(true)

      done()
    })
  })
})
