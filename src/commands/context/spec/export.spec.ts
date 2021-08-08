import SASjs, { Context, ContextAllAttributes } from '@sasjs/adapter/node'
import { Logger, LogLevel } from '@sasjs/utils'
import * as fileModule from '@sasjs/utils/file'
import path from 'path'
import { exportContext } from '../export'

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

  it('should export the specified context to a JSON file', async () => {
    const expectedPath = path.join(process.cwd(), testContext.name + '.json')
    await exportContext('testContext', sasjs, testToken)

    expect(sasjs.getComputeContextByName).toHaveBeenCalledWith(
      'testContext',
      testToken
    )
    expect(sasjs.getComputeContextById).toHaveBeenCalledWith(
      testContext.id,
      testToken
    )
    expect(fileModule.createFile).toHaveBeenCalledWith(
      expectedPath,
      JSON.stringify(testContextAllAttributes, null, 2)
    )
    expect(logger.success).toHaveBeenCalledWith(
      `Context successfully exported to '${expectedPath}'.`
    )
  })

  it('should log and throw errors that occur when fetching the context by name', async () => {
    jest
      .spyOn(sasjs, 'getComputeContextByName')
      .mockImplementation(() => Promise.reject(new Error('Test Error')))

    const err = await exportContext('testContext', sasjs, testToken).catch(
      (e) => e
    )

    expect(err).toBeInstanceOf(Error)
    expect(err.message).toEqual('Test Error')
    expect(process.logger.error).toHaveBeenLastCalledWith(
      `An error has occurred while fetching context ${testContext.name}: `,
      new Error('Test Error')
    )
    expect(sasjs.getComputeContextById).not.toHaveBeenCalled()
  })

  it('should log and throw errors that occur when fetching the context by ID', async () => {
    jest
      .spyOn(sasjs, 'getComputeContextById')
      .mockImplementation(() => Promise.reject(new Error('Test Error')))

    const err = await exportContext('testContext', sasjs, testToken).catch(
      (e) => e
    )

    expect(err).toBeInstanceOf(Error)
    expect(err.message).toEqual('Test Error')
    expect(process.logger.error).toHaveBeenLastCalledWith(
      `An error has occurred while fetching context ${testContext.name}: `,
      new Error('Test Error')
    )
    expect(fileModule.createFile).not.toHaveBeenCalled()
  })

  it('should log and throw errors that occur when the returned context contains invalid JSON', async () => {
    jest.spyOn(JSON, 'stringify').mockImplementation(() => {
      throw new Error('Test Error')
    })

    const err = await exportContext('testContext', sasjs, testToken).catch(
      (e) => e
    )

    expect(err).toBeInstanceOf(Error)
    expect(err.message).toEqual('Test Error')
    expect(process.logger.error).toHaveBeenLastCalledWith(
      `Error stringifying context JSON: `,
      new Error('Test Error')
    )
    expect(fileModule.createFile).not.toHaveBeenCalled()
  })

  it('should log and throw errors that occur when the JSON file is being created', async () => {
    jest
      .spyOn(fileModule, 'createFile')
      .mockImplementation(() => Promise.reject(new Error('Test Error')))

    const err = await exportContext('testContext', sasjs, testToken).catch(
      (e) => e
    )

    expect(err).toBeInstanceOf(Error)
    expect(err.message).toEqual('Test Error')
    expect(process.logger.error).toHaveBeenLastCalledWith(
      `Error creating context JSON file: `,
      new Error('Test Error')
    )
    expect(process.logger.success).not.toHaveBeenCalled()
  })
})

const setupMocks = () => {
  process.logger = logger

  jest.resetAllMocks()
  jest.mock('@sasjs/utils/file')
  jest
    .spyOn(sasjs, 'getComputeContextByName')
    .mockImplementation(() => Promise.resolve(testContext))
  jest
    .spyOn(sasjs, 'getComputeContextById')
    .mockImplementation(() => Promise.resolve(testContextAllAttributes))
  jest
    .spyOn(fileModule, 'createFile')
    .mockImplementation(() => Promise.resolve())
  jest.spyOn(logger, 'error')
  jest.spyOn(logger, 'success')
}
