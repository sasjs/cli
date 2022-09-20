import SASjs from '@sasjs/adapter/node'
import { AuthConfig } from '@sasjs/utils'
import { saveLog, saveOutput } from '../utils'

export async function executeJobSasjs(
  sasjs: SASjs,
  jobPath: string,
  logFile?: string,
  output?: string,
  authConfig?: AuthConfig
) {
  const response = await sasjs.executeJobSASjs(
    {
      _program: jobPath
    },
    authConfig
  )

  if (response) {
    process.logger.success('Job executed successfully!')

    if (!!logFile && response.log) {
      await saveLog(response.log, logFile, jobPath, false)
    }

    if (!!output && response.result) {
      await saveOutput(response.result, output, false)
    }
  }

  return response
}
