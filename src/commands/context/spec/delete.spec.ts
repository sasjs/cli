import SASjs, { Context, ContextAllAttributes } from '@sasjs/adapter/node'
import { Logger, LogLevel } from '@sasjs/utils'
import path from 'path'
import { deleteContext } from '../delete'

const sasjs = new (<jest.Mock<SASjs>>SASjs)()
const testContext: Context = {
  name: 'testContext',
  id: 'id',
  createdBy: 'SASjs CLI test',
  version: 1
}
const testContextAllAttributes: ContextAllAttributes = {
  ...testContext,
  attributes: { reuseServerProcesses: true, runServerAs: 'me' },
  creationTimeStamp: '',
  modifiedTimeStamp: '',
  createdBy: 'SASjs CLI',
  modifiedBy: 'SASjs CLI',
  launchType: 'service',
  environment: { autoExecLines: [''] },
  launchContext: {
    contextName: 'test'
  }
}
const testToken = 't0k3n'
const logger = new Logger(LogLevel.Off)

describe('sasjs context edit', () => {
  beforeEach(() => {
    setupMocks()
  })

  it('should delete the specified context', async () => {
    const expectedPath = path.join(process.cwd(), testContext.name + '.json')
    await deleteContext('testContext', sasjs, testToken)

    expect(sasjs.deleteComputeContext).toHaveBeenCalledWith(
      'testContext',
      testToken
    )
    expect(logger.success).toHaveBeenCalledWith(
      `Context 'testContext' has been deleted!`
    )
  })

  it('should log and throw errors that occur when deleting the context', async () => {
    jest
      .spyOn(sasjs, 'deleteComputeContext')
      .mockImplementation(() => Promise.reject(new Error('Test Error')))

    const err = await deleteContext('testContext', sasjs, testToken).catch(
      (e) => e
    )

    expect(err).toBeInstanceOf(Error)
    expect(err.message).toEqual('Test Error')
    expect(process.logger.error).toHaveBeenLastCalledWith(
      `Error deleting context '${testContext.name}': `,
      new Error('Test Error')
    )
    expect(process.logger.success).not.toHaveBeenCalled()
  })
})

const setupMocks = () => {
  process.logger = logger

  jest.resetAllMocks()
  jest
    .spyOn(sasjs, 'deleteComputeContext')
    .mockImplementation(() =>
      Promise.resolve({ result: testContext, etag: '' })
    )
  jest.spyOn(logger, 'error')
  jest.spyOn(logger, 'success')
}
