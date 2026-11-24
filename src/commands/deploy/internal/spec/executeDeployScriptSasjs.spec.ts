import path from 'path'
import { Logger, ServerType, Target, readFile } from '@sasjs/utils'
import * as configUtils from '../../../../utils/config'
import * as utilsModule from '../../../../utils/utils'
import { executeDeployScriptSasjs } from '../executeDeployScriptSasjs'

describe('executeDeployScriptSasjs', () => {
  const logFilePath = path.join(__dirname, 'sasjsbuild', 'sasjsdeploy.log')
  const deployScriptName = 'sasjsdeploy.sas'
  const linesToExecute = ['data _null_;', 'run;']

  const target = new Target({
    name: 'sasjs',
    serverUrl: 'http://localhost:5000',
    appLoc: '/Public/app',
    serverType: ServerType.Sasjs
  })

  let executeScript: jest.Mock

  beforeEach(() => {
    process.logger = new Logger()
    jest.spyOn(process.logger, 'success').mockImplementation(() => {})
    jest.spyOn(process.logger, 'error').mockImplementation(() => {})
    jest.spyOn(process.logger, 'info').mockImplementation(() => {})
    jest.spyOn(process.logger, 'log').mockImplementation(() => {})

    jest
      .spyOn(utilsModule, 'isSasJsServerInServerMode')
      .mockResolvedValue(false)

    executeScript = jest.fn()

    jest.spyOn(configUtils, 'getSASjs').mockReturnValue({
      executeScript
    } as any)
  })

  it('should write the execution log and report success', async () => {
    executeScript.mockResolvedValue('NOTE: Services deployed.')

    await executeDeployScriptSasjs(
      deployScriptName,
      target,
      linesToExecute,
      logFilePath
    )

    expect(await readFile(logFilePath)).toEqual('NOTE: Services deployed.')
    expect(process.logger?.success).toHaveBeenCalledWith(
      `Deployment completed! Log is available at ${logFilePath}`
    )
    expect(process.logger?.error).not.toHaveBeenCalled()
  })

  it('should write the error to the log and fail the deploy when the runner errors', async () => {
    executeScript.mockRejectedValue(
      new Error('Error executing script: job failed')
    )

    await expect(
      executeDeployScriptSasjs(
        deployScriptName,
        target,
        linesToExecute,
        logFilePath
      )
    ).rejects.toThrow('Deployment failed.')

    expect(await readFile(logFilePath)).toContain(
      'Error executing script: job failed'
    )
    expect(process.logger?.error).toHaveBeenCalledWith(
      `Deployment failed with errors! Log is available at ${logFilePath}`
    )
    expect(process.logger?.success).not.toHaveBeenCalled()
  })

  it('should print the web app URL for a streaming target', async () => {
    executeScript.mockResolvedValue('NOTE: Services deployed.')

    await executeDeployScriptSasjs(
      deployScriptName,
      target,
      linesToExecute,
      logFilePath,
      { streamWeb: true, streamServiceName: 'clickme' } as any
    )

    expect(process.logger?.info).toHaveBeenCalledWith(
      `Web app is available at ${target.serverUrl}/StoredProgram?_FILE=${encodeURI(
        target.appLoc
      )}/clickme.html (needs sasjs/server v7.23.0 or later, the release that serves the /StoredProgram tier)`
    )

    // and nothing else: the app stream is a second door to the same app, not an
    // address of its own, so a streamed deploy does not name it
    expect(process.logger?.info).not.toHaveBeenCalledWith(
      expect.stringContaining('App stream:')
    )
  })
})
