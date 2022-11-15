import { getSASjsAndAuthConfig } from '../../../utils/config'
import { displaySasjsRunnerError } from '../../../utils/utils'
import {
  createFile,
  Target,
  StreamConfig,
  decodeFromBase64
} from '@sasjs/utils'
import { formatErrorString } from './'

/**
 * Execute deployScript on `SAS9` server.
 * @param {string} deployScriptName - name of deploy script.
 * @param {Target} target - the target having deploy configuration.
 * @param {string[]} linesToExecute - array of SAS code lines of deploy script to execute.
 * @param {string} logFolder - optional path to log folder,
 * log file name will be <deploy-script-name>.log
 * @param {object} streamConfig - optional configuration object of StreamConfig
 * for printing web app url on console.
 */
export async function deployToSas9(
  deployScriptName: string,
  target: Target,
  linesToExecute: string[],
  logFilePath: string,
  streamConfig?: StreamConfig
) {
  const { sasjs, authConfigSas9 } = await getSASjsAndAuthConfig(target)
  const userName = authConfigSas9!.userName
  const password = decodeFromBase64(authConfigSas9!.userName)

  let completedWithError = false
  const executionResult = await sasjs
    .executeScript({
      linesOfCode: linesToExecute,
      authConfigSas9: { userName, password }
    })
    .catch((err) => {
      process.logger?.log(formatErrorString(err))
      if (err && err.errorCode === 404) {
        displaySasjsRunnerError(userName)
      }
      completedWithError = true
      return err
    })

  if (!executionResult) {
    return process.logger?.error('Error getting execution log')
  }

  const logContent = completedWithError
    ? executionResult.result
    : executionResult

  await createFile(logFilePath, logContent ?? '')

  if (completedWithError) {
    process.logger?.error(
      `Deployment failed with errors! Log is available at ${logFilePath}`
    )

    throw new Error(`Deployment failed.`)
  }

  process.logger?.success(
    `Deployment completed! Log is available at ${logFilePath}`
  )

  if (streamConfig?.streamWeb) {
    const appLoc = encodeURI(target.appLoc)
    const webAppStreamUrl = `${target.serverUrl}/SASStoredProcess/?_PROGRAM=${appLoc}/services/${streamConfig.streamServiceName}`
    process.logger?.info(`Web app is available at ${webAppStreamUrl}`)
  }
}
