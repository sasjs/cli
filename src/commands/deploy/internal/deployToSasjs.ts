import { createFile, Target, StreamConfig } from '@sasjs/utils'
import { getAuthConfig, getSASjs } from '../../../utils/config'
import { isSasJsServerInServerMode } from '../../../utils/utils'
import { formatErrorString } from './'

/**
 * Execute deployScript on `SASJS` server.
 * @param {string} deployScriptName - name of deploy script.
 * @param {Target} target - the target having deploy configuration.
 * @param {string[]} linesToExecute - array of SAS code lines of deploy script to execute.
 * @param {string} logFilePath - optional path to log folder,
 * log file name will be <deploy-script-name>.log
 * @param {object} streamConfig - optional configuration object of StreamConfig
 * for printing web app url on console.
 */
export async function deployToSasJS(
  deployScriptName: string,
  target: Target,
  linesToExecute: string[],
  logFilePath: string,
  streamConfig?: StreamConfig
) {
  process.logger?.info(
    `Sending ${deployScriptName} to SASJS server for execution.`
  )

  const authConfig = (await isSasJsServerInServerMode(target))
    ? await getAuthConfig(target)
    : undefined
  const sasjs = getSASjs(target)

  let completedWithError = false
  const executionResult = await sasjs
    .executeScript({
      linesOfCode: linesToExecute,
      runTime: 'sas',
      authConfig
    })
    .catch((err: any) => {
      const errorString = formatErrorString(err)
      process.logger.error('executeScript Error:', errorString)
      return errorString
    })

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
    const webAppStreamUrl = `${target.serverUrl}/AppStream/${streamConfig.streamServiceName}`
    process.logger?.info(`Web app is available at ${webAppStreamUrl}`)
  }
}
