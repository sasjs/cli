import SASjs from '@sasjs/adapter/node'
import { Logger, LogLevel, ServerType, Target } from '@sasjs/utils'
import path from 'path'
import { mockAuthConfig } from '../../job/spec/mocks'
import { list } from '../list'

const sasjs = new (<jest.Mock<SASjs>>SASjs)()

const target = new Target({
  name: 'test',
  appLoc: '/Public/test/',
  serverType: ServerType.SasViya,
  contextName: 'test context'
})

const testExecutableContext = {
  name: 'testExecutableContext',
  id: '1',
  createdBy: 'SASjs CLI test',
  version: 1,
  attributes: { reuseServerProcesses: true, runServerAs: 'me' },
  creationTimeStamp: '',
  modifiedTimeStamp: '',
  modifiedBy: 'SASjs CLI test',
  launchType: 'service',
  environment: { autoExecLines: [''] },
  launchContext: {
    contextName: 'test'
  }
}

const testNonExecutableContext = {
  ...testExecutableContext,
  name: 'testNonExecutableContext',
  id: '2'
}
const logger = new Logger(LogLevel.Off)

describe('sasjs context edit', () => {
  beforeEach(() => {
    setupMocks()
  })

  it('should list the contexts available on the specified target server', async () => {
    await list(target, sasjs, mockAuthConfig)

    expect(sasjs.getExecutableContexts).toHaveBeenCalledWith(mockAuthConfig)
    expect(sasjs.getComputeContexts).toHaveBeenCalledWith(
      mockAuthConfig.access_token
    )
    expect(logger.success).toHaveBeenCalledWith(
      `Accessible contexts:\n1. ${testExecutableContext.name}\n`
    )
    expect(logger.success).toHaveBeenCalledWith(
      `Inaccessible contexts:\n1. ${testNonExecutableContext.name}\n`
    )
  })

  it('should log and throw errors that occur when fetching executable contexts', async () => {
    jest
      .spyOn(sasjs, 'getExecutableContexts')
      .mockImplementation(() => Promise.reject(new Error('Test Error')))

    const err = await list(target, sasjs, mockAuthConfig).catch((e) => e)

    expect(err).toBeInstanceOf(Error)
    expect(err.message).toEqual('Test Error')
    expect(process.logger.error).toHaveBeenCalledWith(
      `Error listing contexts: `,
      new Error('Test Error')
    )
    expect(sasjs.getComputeContexts).not.toHaveBeenCalled()
  })

  it('should log and throw errors that occur when fetching compute contexts', async () => {
    jest
      .spyOn(sasjs, 'getComputeContexts')
      .mockImplementation(() => Promise.reject(new Error('Test Error')))

    const err = await list(target, sasjs, mockAuthConfig).catch((e) => e)

    expect(err).toBeInstanceOf(Error)
    expect(err.message).toEqual('Test Error')
    expect(process.logger.error).toHaveBeenCalledWith(
      `Error listing contexts: `,
      new Error('Test Error')
    )
    expect(process.logger.success).not.toHaveBeenCalled()
  })
})

const setupMocks = () => {
  process.logger = logger

  jest.resetAllMocks()
  jest
    .spyOn(sasjs, 'getExecutableContexts')
    .mockImplementation(() => Promise.resolve([testExecutableContext]))
  jest
    .spyOn(sasjs, 'getComputeContexts')
    .mockImplementation(() =>
      Promise.resolve([testExecutableContext, testNonExecutableContext])
    )
  jest.spyOn(logger, 'error')
  jest.spyOn(logger, 'success')
}
