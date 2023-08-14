import { AuthConfig, Target } from '@sasjs/utils'
import { saveLog, saveOutput } from '../utils'
import SASjs from '@sasjs/adapter/node'

/**
 * Triggers existing job for execution on SASJS server.
 * @param {object} sasjs - configuration object of SAS adapter.
 * @param target - SASJS server configuration.
 * @param jobPath - location of the job.
 * @param logFile - flag indicating if CLI should fetch and save log to provided file path. If filepath wasn't provided, {job}.log file will be created in current folder.
 * @param output - flag indicating if CLI should save output to provided file path.
 * @returns - promise that resolves into an object with log and output.
 */
export async function executeJobSasjs(
  sasjs: SASjs,
  target: Target,
  jobPath: string,
  logFile?: string,
  output?: string,
  authConfig?: AuthConfig
) {
  const response = await sasjs.executeJob(
    {
      _program: jobPath
    },
    target.appLoc,
    authConfig
  )

  if (response) {
    // handle success
    process.logger?.success('Job executed successfully!')

    // save log if it is present
    if (!!logFile && response.log) await saveLog(response.log, logFile, jobPath)

    // save output if it is present
    if (!!output && response.result) await saveOutput(response.result, output)
  }

  return response
}
