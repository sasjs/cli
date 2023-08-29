import { Target, ServerType } from '@sasjs/utils'
import { runSasCode } from '../run'
import * as utilsModule from '../../../utils/utils'
import * as configModule from '../../../utils/config'
import * as saveLogModule from '../../../utils/saveLog'
import * as fileModule from '@sasjs/utils/file'
import * as getAbsolutePathModule from '@sasjs/utils/file/getAbsolutePath'
import SASjs, { ErrorResponse } from '@sasjs/adapter/node'
import { setConstants, saveLog } from '../../../utils'

const sasjs = new (<jest.Mock<SASjs>>SASjs)()

describe('sasjs run', () => {
  describe('SASJS', () => {
    const target = new Target({
      name: 'test',
      appLoc: '/Public/test/',
      serverType: ServerType.Sasjs,
      contextName: 'test context'
    })
    const logData = 'SAS log'
    const filePath = 'test.sas'

    beforeAll(async () => {
      await setConstants(false)
    })

    beforeEach(() => {
      setupMocks(filePath, logData)
    })

    it('should saveLog function with correct log data', async () => {
      jest
        .spyOn(sasjs, 'executeScript')
        .mockImplementation(() => Promise.resolve({ log: logData }))
      jest.spyOn(saveLogModule, 'saveLog').mockImplementation()

      process.sasjsConstants.buildDestinationResultsFolder = __dirname

      await runSasCode(target, filePath, false, '')

      expect(saveLog).toHaveBeenCalledWith(
        logData,
        expect.stringMatching(/sasjs-run-\d{14}\.log$/),
        '',
        undefined
      )
    })

    it('should throw an error if log is not returned by @sasjs/adapter', async () => {
      jest
        .spyOn(sasjs, 'executeScript')
        .mockImplementation(() => Promise.resolve({}))

      const expectedError = new ErrorResponse(
        'We were not able to fetch the log this time.'
      )

      await expect(runSasCode(target, filePath, false, '')).rejects.toEqual(
        expectedError
      )
    })
  })
})

const setupMocks = (filePath: string, logData: string) => {
  jest
    .spyOn(getAbsolutePathModule, 'getAbsolutePath')
    .mockImplementation(() => filePath)
  jest
    .spyOn(fileModule, 'readFile')
    .mockImplementation(() => Promise.resolve('test SAS code;'))
  jest
    .spyOn(utilsModule, 'isSasJsServerInServerMode')
    .mockImplementation(() => Promise.resolve(true))
  jest.spyOn(configModule, 'getAuthConfig').mockImplementation(() =>
    Promise.resolve({
      access_token: 'test_access_token',
      refresh_token: 'test_refresh_token',
      client: 'test_client',
      secret: ''
    })
  )
  jest.spyOn(configModule, 'getSASjs').mockImplementation((target) => sasjs)
}
