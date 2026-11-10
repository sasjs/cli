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

  if (streamConfig?.streamWeb) {
    // A server that indexes apps answers the app it just published, and its id is
    // the URL: print that, because it is the address the app is actually served
    // on. A server that answered only a stream name is one whose index is still
    // keyed by label, and its `/AppStream/<name>` is the address that works.
    const app = (result as { app?: { id?: string } })?.app

    const webAppStreamUrl = app?.id
      ? `${target.serverUrl}/app/${app.id}/`
      : result?.streamServiceName
        ? `${target.serverUrl}/AppStream/${result.streamServiceName}`
        : undefined

    if (webAppStreamUrl)
      process.logger?.info(`Web app is available at ${webAppStreamUrl}`)
  }
}
