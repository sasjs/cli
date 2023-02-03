import os from 'os'
import { getSASjsAndAuthConfig } from '../../../utils/config'
import { createFile, Target, StreamConfig } from '@sasjs/utils'

/**
 * Execute deployScript on `SASVIYA` server.
 * @param {string} deployScriptName - name of deploy script.
 * @param {Target} target - the target having deploy configuration.
 * @param {string[]} linesToExecute - array of SAS code lines of deploy script to execute.
 * @param {string} logFilePath - path to log file,
 * log file name will be <deploy-script-name>.log
 * @param {object} streamConfig - optional configuration object of StreamConfig
 * for printing web app url on console.
 */
export async function executeDeployScriptSasViya(
  deployScriptName: string,
  target: Target,
  linesToExecute: string[],
  logFilePath: string,
  streamConfig?: StreamConfig
) {
  process.logger?.info(
    `Sending ${deployScriptName} to SAS server for execution.`
  )

  const contextName = target.contextName

  if (!contextName) {
    throw new Error(
      'Compute Context Name is required for SAS Viya deployments.\n Please ensure that `contextName` is present in your build target configuration or in your .env file, and try again.\n'
    )
  }

  const { sasjs, authConfig } = await getSASjsAndAuthConfig(target)

  const executionResult = await sasjs
    .executeScript({
      fileName: deployScriptName,
      linesOfCode: linesToExecute,
      contextName,
      authConfig
    })
    .catch((err: any) => {
      process.logger.error('executeScriptSASViya Error', err)
      if (err.log) return { log: err.log, completedWithError: true }

      throw err
    })

  let log
  try {
    if (typeof executionResult.log === 'string') {
      log = executionResult.log
    } else if (executionResult.log.items) {
      log = executionResult.log.items
        .map((i: { line: string }) => i.line)
        .join(os.EOL)
    } else {
      log = JSON.stringify(executionResult.log).replace(/\\n/g, os.EOL)
    }
  } catch (e: any) {
    process.logger?.error(
      `An error occurred when parsing the execution response: ${e.message}`
    )

    log = executionResult
  }

  await createFile(logFilePath, log)

  if (executionResult.completedWithError) {
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
    const webAppStreamUrl = `${target.serverUrl}/SASJobExecution?_FILE=${appLoc}/services/${streamConfig.streamServiceName}.html&_debug=2`
    process.logger?.info(`Web app is available at ${webAppStreamUrl}`)
  }
}
