import { SASjsApiClient, SasjsRequestClient } from '@sasjs/adapter/node'
import { getAuthConfig } from '../../../utils/config'
import { isSasJsServerInServerMode } from '../../../utils/utils'
import { readFile, Target, StreamConfig, ServicePackSASjs } from '@sasjs/utils'

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
  const jsonContent = await readFile(jsonFilePath)
  const payload: ServicePackSASjs = JSON.parse(jsonContent)

  const authConfig = (await isSasJsServerInServerMode(target))
    ? await getAuthConfig(target)
    : undefined

  const sasjsApiClient = new SASjsApiClient(
    new SasjsRequestClient(target.serverUrl, target.httpsAgentOptions)
  )

  const result = await sasjsApiClient
    .deploy(payload, target.appLoc, authConfig)
    .catch((err) => {
      process.logger?.error('deployToSASjs Error', err)
    })

  if (result?.status === 'failure') {
    process.logger?.error(result.message)

    if (result.example) {
      process.logger?.info(
        `Payload example:\n${JSON.stringify(result.example, null, 2)}`
      )
    }
  }

  if (streamConfig?.streamWeb && result?.streamServiceName) {
    const webAppStreamUrl = `${target.serverUrl}/AppStream/${result.streamServiceName}`
    process.logger?.info(`Web app is available at ${webAppStreamUrl}`)
  }
}
