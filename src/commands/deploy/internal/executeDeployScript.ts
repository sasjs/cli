import { Target, StreamConfig } from '@sasjs/utils'
import { isSasFile } from '../../../utils/file'
import { executeSasScript, executeNonSasScript } from './'

export async function executeDeployScript(
  scriptPath: string,
  target: Target,
  streamConfig: StreamConfig
) {
  if (isSasFile(scriptPath))
    return await executeSasScript(scriptPath, target, streamConfig)

  return executeNonSasScript(scriptPath)
}
