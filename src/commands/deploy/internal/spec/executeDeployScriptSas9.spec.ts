import path from 'path'
import {
  Logger,
  ServerType,
  Target,
  encodeToBase64,
  readFile
} from '@sasjs/utils'
import * as configUtils from '../../../../utils/config'
import { executeDeployScriptSas9 } from '../executeDeployScriptSas9'

const errorLogContents = `ERROR: Expecting an arithmetic operator.
ERROR: %ABORT statement is not valid in open code.`

/**
 * A stored process error as the adapter surfaces it - JobExecutionError
 * carries the SAS log in `result`. Reproduced here as a plain object so the
 * test does not depend on the adapter's node entry re-exporting the class.
 */
const jobExecutionError = (result: string) =>
  Object.assign(
    new Error('Error Code 500: This request completed with errors.'),
    {
      name: 'JobExecutionError',
      errorCode: 500,
      errorMessage: 'This request completed with errors.',
      result
    }
  )

describe('executeDeployScriptSas9', () => {
  const logFilePath = path.join(__dirname, 'sasjsbuild', 'mysas9deploy.log')
  const deployScriptName = 'mysas9deploy.sas'
  const linesToExecute = ['proc sql;', 'quit;']

  const target = new Target({
    name: 'sas9',
    serverUrl: 'https://sas.example.com:8343',
    appLoc: '/Public/app',
    serverType: ServerType.Sas9
  })

  let executeScript: jest.Mock

  beforeEach(async () => {
    process.logger = new Logger()
    jest.spyOn(process.logger, 'success').mockImplementation(() => {})
    jest.spyOn(process.logger, 'error').mockImplementation(() => {})
    jest.spyOn(process.logger, 'info').mockImplementation(() => {})
    jest.spyOn(process.logger, 'log').mockImplementation(() => {})

    executeScript = jest.fn()

    jest.spyOn(configUtils, 'getSASjsAndAuthConfig').mockResolvedValue({
      sasjs: { executeScript } as any,
      authConfigSas9: {
        userName: 'sasjsuser',
        password: encodeToBase64('secret')
      } as any
    })
  })

  it('should write the execution log and report success', async () => {
    executeScript.mockResolvedValue('NOTE: Services deployed.')

    await executeDeployScriptSas9(
      deployScriptName,
      target,
      linesToExecute,
      logFilePath
    )

    expect(executeScript).toHaveBeenCalledWith({
      linesOfCode: linesToExecute,
      authConfigSas9: { userName: 'sasjsuser', password: 'secret' }
    })
    expect(await readFile(logFilePath)).toEqual('NOTE: Services deployed.')
    expect(process.logger?.success).toHaveBeenCalledWith(
      `Deployment completed! Log is available at ${logFilePath}`
    )
    expect(process.logger?.error).not.toHaveBeenCalled()
  })

  it('should write the SAS log, report the log path and fail the deploy when the job errors', async () => {
    executeScript.mockRejectedValue(jobExecutionError(errorLogContents))

    await expect(
      executeDeployScriptSas9(
        deployScriptName,
        target,
        linesToExecute,
        logFilePath
      )
    ).rejects.toThrow('Deployment failed.')

    expect(await readFile(logFilePath)).toEqual(errorLogContents)
    expect(process.logger?.error).toHaveBeenCalledWith(
      `Deployment failed with errors! Log is available at ${logFilePath}`
    )
    expect(process.logger?.success).not.toHaveBeenCalled()
  })

  it('should fail the deploy when the SASjs runner is missing, with the runner message and no stale success line', async () => {
    const runnerError = jobExecutionError('')
    runnerError.message =
      "Error Code 500: SASJS runner not found. Here's the link (https://cli.sasjs.io/auth/#sasjs-runner) to the SAS code for registering the SASjs runner"

    executeScript.mockRejectedValue(runnerError)

    await expect(
      executeDeployScriptSas9(
        deployScriptName,
        target,
        linesToExecute,
        logFilePath
      )
    ).rejects.toThrow('Deployment failed.')

    expect(process.logger?.error).toHaveBeenCalledWith(
      expect.stringContaining('SASJS runner not found')
    )
    expect(process.logger?.success).not.toHaveBeenCalled()
  })

  it('should still fail the deploy when a non-job error is raised', async () => {
    executeScript.mockRejectedValue(new Error('socket hang up'))

    await expect(
      executeDeployScriptSas9(
        deployScriptName,
        target,
        linesToExecute,
        logFilePath
      )
    ).rejects.toThrow('Deployment failed.')

    expect(process.logger?.error).toHaveBeenCalledWith(
      expect.stringContaining('socket hang up')
    )
    expect(process.logger?.success).not.toHaveBeenCalled()
  })

  it('should print the web app URL for a streaming target', async () => {
    executeScript.mockResolvedValue('NOTE: Services deployed.')

    await executeDeployScriptSas9(
      deployScriptName,
      target,
      linesToExecute,
      logFilePath,
      { streamWeb: true, streamServiceName: 'clickme' } as any
    )

    expect(process.logger?.info).toHaveBeenCalledWith(
      `Web app is available at ${target.serverUrl}/SASStoredProcess/?_PROGRAM=${encodeURI(
        target.appLoc
      )}/services/clickme`
    )
  })
})
