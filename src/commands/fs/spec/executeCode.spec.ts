import SASjs from '@sasjs/adapter/node'
import { Logger, LogLevel, ServerType, Target } from '@sasjs/utils'
import { executeCode } from '../internal/executeCode'
import * as configUtils from '../../../utils/config'
import * as utilsModule from '../../../utils/utils'

const targetConfig = {
  name: 'test',
  appLoc: '/Public/test/',
  serverType: ServerType.Sasjs
}

const authConfig = {
  access_token: '',
  refresh_token: '',
  client: '',
  secret: ''
}

const mockedResponse = {
  log: 'mocked response'
}

describe('executeCode', () => {
  beforeAll(() => {
    process.projectDir = __dirname
  })

  describe('on viya', () => {
    const target = new Target({
      ...targetConfig,
      serverType: ServerType.SasViya
    })

    beforeEach(() => {
      mockGetSASjsAndAuthConfig(target)

      jest
        .spyOn(SASjs.prototype, 'executeScript')
        .mockImplementation(() => Promise.resolve(mockedResponse))
    })

    it('should execute code on SASViya', async () => {
      const result = await executeCode(target, '')
      expect(result).toEqual(mockedResponse)
    })
  })

  describe('on sas9', () => {
    const target = new Target({
      ...targetConfig,
      serverType: ServerType.Sas9
    })

    beforeEach(() => {
      mockExecuteScript()

      jest.spyOn(configUtils, 'getSASjsAndAuthConfig').mockImplementation(() =>
        Promise.resolve({
          sasjs: configUtils.getSASjs(target),
          authConfigSas9: {
            userName: '',
            password: ''
          }
        })
      )
    })

    it('should execute code on SAS9', async () => {
      const result = await executeCode(target, '')
      expect(result).toEqual(mockedResponse)
    })
  })

  describe('on sasjs', () => {
    const target = new Target({
      ...targetConfig,
      serverType: ServerType.Sasjs
    })

    beforeEach(() => {
      mockExecuteScript()
    })

    it('should execute code on SASjs Server when running in desktop mode', async () => {
      jest
        .spyOn(utilsModule, 'isSasJsServerInServerMode')
        .mockImplementation(() => Promise.resolve(false))

      const result = await executeCode(target, '')
      expect(result).toEqual(mockedResponse)
    })

    it('should execute code on SASjs Server when running in server mode', async () => {
      jest
        .spyOn(utilsModule, 'isSasJsServerInServerMode')
        .mockImplementation(() => Promise.resolve(true))

      jest
        .spyOn(configUtils, 'getAuthConfig')
        .mockImplementation(() => Promise.resolve(authConfig))

      const result = await executeCode(target, '')
      expect(result).toEqual(mockedResponse)
    })
  })
})

const mockExecuteScript = () => {
  jest
    .spyOn(SASjs.prototype, 'executeScript')
    .mockImplementation(() => Promise.resolve(mockedResponse.log))
}

const mockGetSASjsAndAuthConfig = (target: Target) => {
  jest.spyOn(configUtils, 'getSASjsAndAuthConfig').mockImplementation(() =>
    Promise.resolve({
      sasjs: configUtils.getSASjs(target),
      authConfig
    })
  )
}
