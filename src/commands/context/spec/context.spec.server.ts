import path from 'path'
import { processContext } from '../..'
import {
  Target,
  readFile,
  createFile,
  deleteFolder,
  generateTimestamp
} from '@sasjs/utils'
import { sanitizeFileName } from '../../../utils/file'
import SASjs from '@sasjs/adapter/node'
import { removeFromGlobalConfig } from '../../../utils/config'
import { Command } from '../../../utils/command'
import { createTestGlobalTarget } from '../../../utils/test'
import { getConstants } from '../../../constants'

let contexts: any[]
let testContextConfig: any
let testContextConfigFile: string
let testContextConfigPath: string
let originalTestContextConfigName: string
let sasjs = new SASjs()
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
const mockedAdapterResponse = {
  result: {
    name: 'Edited mock context',
    id: 'id',
    createdBy: 'CLI mock',
    version: 1
  },
  etag: 'etag'
}

describe('sasjs context', () => {
  const timestamp = generateTimestamp()
  const targetName = `cli-tests-context-${timestamp}`
  let target: Target

  beforeAll(async () => {
    target = await createTestGlobalTarget(
      targetName,
      `/Public/app/cli-tests/${targetName}`
    )

    sasjs = new SASjs({
      serverUrl: target.serverUrl,
      allowInsecureRequests: target.allowInsecureRequests,
      appLoc: target.appLoc,
      serverType: target.serverType
    })

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
    it('should export a compute context', async () => {
      const contextName = contexts[0].name
      const command = new Command(
        `context export ${contextName} -t ${targetName}`
      )

      await expect(processContext(command)).resolves.toEqual(true)
    })
  })

  describe('create', () => {
    it('should create a compute context', async () => {
      testContextConfigFile = sanitizeFileName(contexts[0].name) + '.json'
      testContextConfigPath = path.join(process.cwd(), testContextConfigFile)

      let contextConfig = await readFile(testContextConfigPath)

      testContextConfig = JSON.parse(contextConfig)
      testContextConfig = {
        ...testContextConfig,
        launchContext: {
          contextName: (await getConstants()).contextName
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

      jest
        .spyOn(sasjs, 'createComputeContext')
        .mockImplementation(() => Promise.resolve(mockedAdapterResponse.result))

      await expect(processContext(command)).resolves.toEqual(true)
    })

    it('should return an error if trying to create compute context that already exists', async () => {
      testContextConfigFile = sanitizeFileName(contexts[0].name) + '.json'
      testContextConfigPath = path.join(process.cwd(), testContextConfigFile)

      let contextConfig = await readFile(testContextConfigPath)

      testContextConfig = JSON.parse(contextConfig)
      testContextConfig = {
        ...testContextConfig,
        launchContext: {
          contextName: (await getConstants()).contextName
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

      const error = new Error(
        `Compute context '${testContextConfig.name}' already exists.`
      )

      jest
        .spyOn(sasjs, 'createComputeContext')
        .mockImplementation(() => Promise.reject(error))

      await expect(processContext(command, sasjs)).resolves.toEqual(error)
    })
  })

  describe('edit', () => {
    it('should return an error if trying to edit default compute context', async () => {
      testContextConfig.description += '_updated'

      setDefaultContextName()

      const contextConfig = JSON.stringify(testContextConfig, null, 2)

      await createFile(testContextConfigPath, contextConfig)

      const command = new Command(
        `context edit ${testContextConfig.name} -s ${testContextConfigFile} -t ${targetName}`
      )

      jest
        .spyOn(sasjs, 'editComputeContext')
        .mockImplementation(() =>
          Promise.reject(defaultContextError('Editing'))
        )

      await expect(processContext(command, sasjs)).resolves.toEqual(
        defaultContextError('Editing')
      )

      restoreTestContextName()
    })

    it('should edit compute context', async () => {
      testContextConfig.description += '_updated'

      const contextConfig = JSON.stringify(testContextConfig, null, 2)

      await createFile(testContextConfigPath, contextConfig)

      const command = new Command(
        `context edit ${testContextConfig.name} -s ${testContextConfigFile} -t ${targetName}`
      )

      jest
        .spyOn(sasjs, 'editComputeContext')
        .mockImplementation(() => Promise.resolve(mockedAdapterResponse))

      await expect(processContext(command, sasjs)).resolves.toEqual(true)
    })
  })

  describe('delete', () => {
    it('should return an error if trying to delete default compute context', async () => {
      setDefaultContextName()

      const command = new Command(
        `context delete ${testContextConfig.name} -t ${targetName}`
      )

      jest
        .spyOn(sasjs, 'deleteComputeContext')
        .mockImplementation(() =>
          Promise.reject(defaultContextError('Deleting'))
        )

      await expect(processContext(command, sasjs)).resolves.toEqual(
        defaultContextError('Deleting')
      )

      restoreTestContextName()
    })

    it('should delete compute context', async () => {
      const command = new Command(
        `context delete ${testContextConfig.name} -t ${targetName}`
      )

      jest
        .spyOn(sasjs, 'deleteComputeContext')
        .mockImplementation(() => Promise.resolve(mockedAdapterResponse))

      await expect(processContext(command, sasjs)).resolves.toEqual(true)
    })
  })
})
