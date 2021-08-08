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

  // it('should log and throw errors that occur when fetching the context by ID', async () => {
  //   jest
  //     .spyOn(sasjs, 'getComputeContextById')
  //     .mockImplementation(() => Promise.reject(new Error('Test Error')))

  //   const err = await exportContext('testContext', sasjs, testToken).catch(
  //     (e) => e
  //   )

  //   expect(err).toBeInstanceOf(Error)
  //   expect(err.message).toEqual('Test Error')
  //   expect(process.logger.error).toHaveBeenLastCalledWith(
  //     `An error has occurred while fetching context ${testExecutableContext.name}: `,
  //     new Error('Test Error')
  //   )
  //   expect(fileModule.createFile).not.toHaveBeenCalled()
  // })

  // it('should log and throw errors that occur when the returned context contains invalid JSON', async () => {
  //   jest.spyOn(JSON, 'stringify').mockImplementation(() => {
  //     throw new Error('Test Error')
  //   })

  //   const err = await exportContext('testContext', sasjs, testToken).catch(
  //     (e) => e
  //   )

  //   expect(err).toBeInstanceOf(Error)
  //   expect(err.message).toEqual('Test Error')
  //   expect(process.logger.error).toHaveBeenLastCalledWith(
  //     `Error stringifying context JSON: `,
  //     new Error('Test Error')
  //   )
  //   expect(fileModule.createFile).not.toHaveBeenCalled()
  // })

  // it('should log and throw errors that occur when the JSON file is being created', async () => {
  //   jest
  //     .spyOn(fileModule, 'createFile')
  //     .mockImplementation(() => Promise.reject(new Error('Test Error')))

  //   const err = await exportContext('testContext', sasjs, testToken).catch(
  //     (e) => e
  //   )

  //   expect(err).toBeInstanceOf(Error)
  //   expect(err.message).toEqual('Test Error')
  //   expect(process.logger.error).toHaveBeenLastCalledWith(
  //     `Error creating context JSON file: `,
  //     new Error('Test Error')
  //   )
  //   expect(process.logger.success).not.toHaveBeenCalled()
  // })

  // it('should use the name from the config if not specified separately', async () => {
  //   await edit('', testContext, sasjs, testToken)

  //   expect(sasjs.editComputeContext).toHaveBeenCalledWith(
  //     testContext.name,
  //     testContext,
  //     testToken
  //   )
  // })

  // it('should log and throw errors that occur during context creation', async () => {
  //   jest
  //     .spyOn(sasjs, 'editComputeContext')
  //     .mockImplementation(() => Promise.reject(new Error('Test Error')))

  //   const error = await edit(
  //     'testContext',
  //     testContext,
  //     sasjs,
  //     testToken
  //   ).catch((e) => e)

  //   expect(sasjs.editComputeContext).toHaveBeenCalledWith(
  //     'testContext',
  //     testContext,
  //     testToken
  //   )
  //   expect(error).toBeInstanceOf(Error)
  //   expect(error.message).toEqual('Test Error')
  //   expect(logger.error).toHaveBeenCalledWith(
  //     'Error editing context: ',
  //     new Error('Test Error')
  //   )
  // })
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
