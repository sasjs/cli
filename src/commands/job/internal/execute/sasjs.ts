import { SASjsApiClient, SasjsRequestClient } from '@sasjs/adapter/node'
import { Target } from '@sasjs/utils'
import { getAuthConfig, isSasJsServerInServerMode } from '../../../../utils'
import { saveLog, saveOutput } from '../utils'

export async function executeJobSasjs(
  target: Target,
  jobPath: string,
  logFile?: string,
  output?: string
) {
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
    process.logger?.success('Job executed successfully!')

    if (!!logFile && response.log) {
      await saveLog(response.log, logFile, jobPath)
    }

    if (!!output && response.result) {
      await saveOutput(response.result, output)
    }
  }

  return response
}
