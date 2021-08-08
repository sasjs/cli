import SASjs from '@sasjs/adapter/node'
import { Logger, LogLevel } from '@sasjs/utils'
import { edit } from '../edit'

const sasjs = new (<jest.Mock<SASjs>>SASjs)()
const testConfig = {
  name: 'testNewContext',
  launchContext: {
    contextName: 'Test launcher context'
  },
  launchType: 'service'
}
const testToken = 't0k3n'
const logger = new Logger(LogLevel.Off)

describe('sasjs context edit', () => {
  beforeEach(() => {
    setupMocks()
  })

  it('should edit a context with the specified configuration', async () => {
    await edit('testContext', testConfig, sasjs, testToken)

    expect(sasjs.editComputeContext).toHaveBeenCalledWith(
      'testContext',
      testConfig,
      testToken
    )
    expect(logger.success).toHaveBeenCalledWith(
      `Context 'testContext' successfully updated!`
    )
  })

  it('should use the name from the config if not specified separately', async () => {
    await edit('', testConfig, sasjs, testToken)

    expect(sasjs.editComputeContext).toHaveBeenCalledWith(
      testConfig.name,
      testConfig,
      testToken
    )
  })

  it('should log and throw errors that occur during context creation', async () => {
    jest
      .spyOn(sasjs, 'editComputeContext')
      .mockImplementation(() => Promise.reject(new Error('Test Error')))

    const error = await edit('testContext', testConfig, sasjs, testToken).catch(
      (e) => e
    )

    expect(sasjs.editComputeContext).toHaveBeenCalledWith(
      'testContext',
      testConfig,
      testToken
    )
    expect(error).toBeInstanceOf(Error)
    expect(error.message).toEqual('Test Error')
    expect(logger.error).toHaveBeenCalledWith(
      'Error editing context: ',
      new Error('Test Error')
    )
  })
})

const setupMocks = () => {
  process.logger = logger

  jest.resetAllMocks()
  jest.spyOn(sasjs, 'editComputeContext').mockImplementation(() =>
    Promise.resolve({
      result: {
        name: 'testContext',
        id: 'id',
        createdBy: 'SASjs CLI test',
        version: 1
      },
      etag: ''
    })
  )
  jest.spyOn(logger, 'error')
  jest.spyOn(logger, 'success')
}
