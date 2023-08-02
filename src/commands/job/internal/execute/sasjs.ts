import { SASjsApiClient, SasjsRequestClient } from '@sasjs/adapter/node'
import { Target } from '@sasjs/utils'
import { getAuthConfig, isSasJsServerInServerMode } from '../../../../utils'
import { saveLog, saveOutput } from '../utils'

/**
 * Triggers existing job for execution on SASJS server.
 * @param target - SASJS server configuration.
 * @param jobPath - location of the job.
 * @param logFile - flag indicating if CLI should fetch and save log to provided file path. If filepath wasn't provided, {job}.log file will be created in current folder.
 * @param output - flag indicating if CLI should save output to provided file path.
 * @returns - promise that resolves into an object with log and output.
 */
export async function executeJobSasjs(
  target: Target,
  jobPath: string,
  logFile?: string,
  output?: string
) {
  // INFO: get authentication configuration if SASJS server is in server mode.
  const authConfig = (await isSasJsServerInServerMode(target))
    ? await getAuthConfig(target)
    : undefined

  const sasjsApiClient = new SASjsApiClient(
    new SasjsRequestClient(target.serverUrl, target.httpsAgentOptions)
  )

  const response = await sasjsApiClient.executeJob(
    {
      _program: jobPath
    },
    target.appLoc,
    authConfig
  )

  if (response) {
    // INFO: handle success
    process.logger?.success('Job executed successfully!')

    // INFO: save log if it is present
    if (!!logFile && response.log) await saveLog(response.log, logFile, jobPath)

    // INFO: save output if it is present
    if (!!output && response.result) await saveOutput(response.result, output)
  }

  return response
}
