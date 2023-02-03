import { SASjsApiClient, SasjsRequestClient } from '@sasjs/adapter/node'
import { getAuthConfig } from '../../../utils/config'
import { isSasJsServerInServerMode } from '../../../utils/utils'
import {
  readFile,
  Target,
  StreamConfig,
  ServicePackSASjs,
  fileExists
} from '@sasjs/utils'

/**
 * Deploys app to `SASJS` server.
 * @param {Target} target - the target having deploy configuration.
 * @param {object} streamConfig - optional config for deploying streaming app.
 */
export async function deployToSasjsWithServicePack(
  jsonFilePath: string,
  target: Target,
  streamConfig?: StreamConfig
) {
  const sasjsApiClient = new SASjsApiClient(
    new SasjsRequestClient(target.serverUrl, target.httpsAgentOptions)
  )

  const authConfig = (await isSasJsServerInServerMode(target))
    ? await getAuthConfig(target)
    : undefined

  let result
  const zipFilePath = jsonFilePath + '.zip'
  if (await fileExists(zipFilePath)) {
    result = await sasjsApiClient
      .deployZipFile(zipFilePath, authConfig)
      .catch((err) => {
        process.logger?.error('deployServicePack error', err)
        throw new Error('Deploy service pack error')
      })
  } else {
    const jsonContent = await readFile(jsonFilePath)
    const payload: ServicePackSASjs = JSON.parse(jsonContent)

    result = await sasjsApiClient
      .deploy(payload, target.appLoc, authConfig)
      .catch((err) => {
        process.logger?.error('deployServicePack error', err)
        throw new Error('Deploy service pack error')
      })
  }

  if (result?.status === 'failure') {
    process.logger?.error(result.message)

    if (result.example) {
      process.logger?.info(
        `Payload example:\n${JSON.stringify(result.example, null, 2)}`
      )
    }

    throw new Error('Deploy service pack error')
  }

  if (streamConfig?.streamWeb && result?.streamServiceName) {
    const webAppStreamUrl = `${target.serverUrl}/AppStream/${result.streamServiceName}`
    process.logger?.info(`Web app is available at ${webAppStreamUrl}`)
  }
}
