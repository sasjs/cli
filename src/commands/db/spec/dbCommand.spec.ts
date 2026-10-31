import { Logger, LogLevel, ServerType, Target } from '@sasjs/utils'
import { ReturnCode } from '../../../types/command'
import * as dbModule from '../db'
import { DbCommand } from '../dbCommand'
import * as configUtils from '../../../utils/config'
import * as setConstantsUtils from '../../../utils/setConstants'

const target = new Target({
  name: 'test-target',
  serverUrl: 'https://sas.example.com',
  serverType: ServerType.SasViya,
  appLoc: '/Public/app'
})

describe('DbCommand', () => {
  const defaultArgs = ['node', 'sasjs']

  beforeEach(() => {
    setupMocks()
  })

  it('should parse a sasjs db command', () => {
    const args = [...defaultArgs, 'db']

    const command = new DbCommand(args)

    expect(command.name).toEqual('db')
  })

  it('should call the db handler when executed', async () => {
    const args = [...defaultArgs, 'db']
    const command = new DbCommand(args)

    const returnCode = await command.execute()

    expect(dbModule.buildDB).toHaveBeenCalled()
    expect(returnCode).toEqual(ReturnCode.Success)
    expect(process.logger.success).toHaveBeenCalledWith('DB build completed!')
  })

  it('should resolve the target - and so set the constants - before building', async () => {
    // buildDB reads buildSourceDbFolder / buildDestinationDbFolder from
    // process.sasjsConstants, which only getTargetInfo sets.
    const calls: string[] = []

    ;(setConstantsUtils.setConstants as jest.Mock).mockImplementation(
      async () => {
        calls.push('setConstants')
      }
    )
    jest.spyOn(dbModule, 'buildDB').mockImplementation(async () => {
      calls.push('buildDB')
    })

    await new DbCommand([...defaultArgs, 'db']).execute()

    expect(calls).toEqual(['setConstants', 'buildDB'])
  })

  it('should return an error code when the execution errors out', async () => {
    const args = [...defaultArgs, 'db']
    jest
      .spyOn(dbModule, 'buildDB')
      .mockImplementation(() => Promise.reject(new Error('Test Error')))
    const command = new DbCommand(args)

    const returnCode = await command.execute()

    expect(returnCode).toEqual(ReturnCode.InternalError)
    expect(process.logger.error).toHaveBeenCalledWith(
      'Error building DB: ',
      new Error('Test Error')
    )
  })
})

const setupMocks = () => {
  jest.resetAllMocks()
  jest.mock('../db')
  jest.spyOn(dbModule, 'buildDB').mockImplementation(() => Promise.resolve())

  jest
    .spyOn(configUtils, 'findTargetInConfiguration')
    .mockImplementation(() => Promise.resolve({ target, isLocal: true }))

  jest
    .spyOn(configUtils, 'getLocalConfig')
    .mockImplementation(() => Promise.resolve({} as any))

  jest
    .spyOn(setConstantsUtils, 'setConstants')
    .mockImplementation(() => Promise.resolve())

  process.logger = new Logger(LogLevel.Off)
  jest.spyOn(process.logger, 'success')
  jest.spyOn(process.logger, 'error')
}
