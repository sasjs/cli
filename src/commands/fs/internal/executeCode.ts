import { Target, ServerType, decodeFromBase64 } from '@sasjs/utils'
import {
  isSasJsServerInServerMode,
  getAuthConfig,
  getSASjsAndAuthConfig,
  getSASjs
} from '../../../utils/'

export const executeCode = async (target: Target, code: string) => {
  if (target.serverType === ServerType.SasViya)
    return await executeOnSasViya(target, code)

  if (target.serverType === ServerType.Sas9)
    return await executeOnSas9(target, code)

  return await executeOnSasJS(target, code)
}

const executeOnSasViya = async (target: Target, code: string) => {
  const { sasjs, authConfig } = await getSASjsAndAuthConfig(target)

  const contextName = target.contextName ?? sasjs.getSasjsConfig().contextName

  const { log } = await sasjs.executeScript({
    fileName: 'program.sas',
    linesOfCode: code.split('\n'),
    contextName,
    authConfig
  })

  return { log }
}

const executeOnSas9 = async (target: Target, code: string) => {
  const { sasjs, authConfigSas9 } = await getSASjsAndAuthConfig(target)
  const userName = authConfigSas9!.userName
  const password = decodeFromBase64(authConfigSas9!.password)

  const executionResult = await sasjs.executeScript({
    linesOfCode: code.split('\n'),
    authConfigSas9: { userName, password }
  })

  return { log: executionResult }
}

const executeOnSasJS = async (target: Target, code: string) => {
  const authConfig = (await isSasJsServerInServerMode(target))
    ? await getAuthConfig(target)
    : undefined
  const sasjs = getSASjs(target)

  const executionResult = await sasjs.executeScript({
    linesOfCode: code.split('\n'),
    runTime: 'sas',
    authConfig
  })

  return { log: executionResult }
}
