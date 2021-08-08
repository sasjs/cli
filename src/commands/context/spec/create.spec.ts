import SASjs from '@sasjs/adapter/node'
import { Logger, LogLevel } from '@sasjs/utils'
import { create } from '../create'

const sasjs = new (<jest.Mock<SASjs>>SASjs)()
const testConfig = {
  name: 'testContext',
  launchContext: {
    contextName: 'Test launcher context'
  },
  launchType: 'service'
}
const testToken = 't0k3n'
const logger = new Logger(LogLevel.Off)

describe('sasjs context create', () => {
  beforeEach(() => {
    setupMocks()
  })
  it('should create a context with the specified configuration', async () => {
    await create(testConfig, sasjs, testToken)

    expect(sasjs.createComputeContext).toHaveBeenCalledWith(
      testConfig.name,
      testConfig.launchContext.contextName,
      undefined,
      undefined,
      testToken
    )
  })

  it('should create a context with additional attributes if specified', async () => {
    const config = {
      ...testConfig,
      environment: { autoExecLines: ['%put "hello";'] },
      attributes: { runServerAs: 'me' }
    }

    await create(config, sasjs, testToken)

    expect(sasjs.createComputeContext).toHaveBeenCalledWith(
      testConfig.name,
      testConfig.launchContext.contextName,
      config.attributes.runServerAs,
      config.environment.autoExecLines,
      testToken
    )
    expect(logger.success).toHaveBeenCalledWith(
      `Context 'testContext' with id 'id' successfully created!`
    )
  })

  it('should log and throw errors that occur during context creation', async () => {
    const config = {
      ...testConfig,
      environment: { autoExecLines: ['%put "hello";'] },
      attributes: { runServerAs: 'me' }
    }
    jest
      .spyOn(sasjs, 'createComputeContext')
      .mockImplementation(() => Promise.reject(new Error('Test Error')))

    const error = await create(config, sasjs, testToken).catch((e) => e)

    expect(sasjs.createComputeContext).toHaveBeenCalledWith(
      testConfig.name,
      testConfig.launchContext.contextName,
      config.attributes.runServerAs,
      config.environment.autoExecLines,
      testToken
    )
    expect(error).toBeInstanceOf(Error)
    expect(error.message).toEqual('Test Error')
    expect(logger.error).toHaveBeenCalledWith(
      'Error creating context: ',
      new Error('Test Error')
    )
  })
})

const setupMocks = () => {
  process.logger = logger

  jest.resetAllMocks()
  jest.spyOn(sasjs, 'createComputeContext').mockImplementation(() =>
    Promise.resolve({
      name: 'testContext',
      id: 'id',
      createdBy: 'SASjs CLI test',
      version: 1
    })
  )
  jest.spyOn(logger, 'error')
  jest.spyOn(logger, 'success')
}
