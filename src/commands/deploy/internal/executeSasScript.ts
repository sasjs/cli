import path from 'path'
import { readFile, ServerType, Target, StreamConfig } from '@sasjs/utils'
import {
  executeDeployScriptSasjs,
  executeDeployScriptSas9,
  executeDeployScriptSasViya
} from './'

export async function executeSasScript(
  scriptPath: string,
  target: Target,
  streamConfig: StreamConfig
) {
  process.logger?.info(`Processing SAS file ${path.basename(scriptPath)} ...`)

  const { buildDestinationFolder: logFolder } = process.sasjsConstants

  const deployScriptName = path.basename(scriptPath)
  const logFilePath = path.join(
    logFolder,
    deployScriptName.replace('.sas', '.log')
  )

  // get content of file
  const deployScriptContent = await readFile(scriptPath)
  // split into lines
  const linesToExecute = deployScriptContent.replace(/\r\n/g, '\n').split('\n')

  if (target.serverType === ServerType.SasViya) {
    return await executeDeployScriptSasViya(
      deployScriptName,
      target,
      linesToExecute,
      logFilePath,
      streamConfig
    )
  }

  if (target.serverType === ServerType.Sas9) {
    return await executeDeployScriptSas9(
      deployScriptName,
      target,
      linesToExecute,
      logFilePath,
      streamConfig
    )
  }

  if (target.serverType === ServerType.Sasjs) {
    await executeDeployScriptSasjs(
      deployScriptName,
      target,
      linesToExecute,
      logFilePath,
      streamConfig
    )
  }
}

/**
 * this function formats the error string to dump error log on console
 * @param error
 * @returns returns a string
 */
export function formatErrorString(error: any) {
  let err = ''

  err += `${error.stack}\n`

  err += `url: ${
    error.config?.url ? removePasswordFromUrl(error.config.url) : ''
  }\n`

  err += `method: ${error.config?.method ? error.config.method : ''}\n`

  err += `headers: ${error.config?.headers ? error.config.headers : ''}\n`

  err += `data: ${error.response?.data ? error.response.data : ''}`
  return err
}

/**
 * removes password from url
 * @param str parameter of type string
 * @returns returns a string
 */
function removePasswordFromUrl(str: string) {
  const startingIndex = str.indexOf('_password')
  if (startingIndex !== -1) {
    return str.slice(0, startingIndex) + 'PASSWORD-REMOVED'
  }

  return str
}
