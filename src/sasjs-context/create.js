import SASjs from '@sasjs/adapter/node'
import { displayResult } from '../utils/displayResult'
import { getAccessToken } from '../utils/config-utils'

/**
 * Creates compute context using provided config.
 * @param {object} config - context configuration.
 * @param {object} target - SAS server configuration.
 */
export async function create(config, target) {
  const sasjs = new SASjs({
    serverUrl: target.serverUrl,
    serverType: target.serverType
  })

  const accessToken = await getAccessToken(target).catch((err) => {
    displayResult(err)
  })

  const { name } = config
  const launchName = config.launchContext && config.launchContext.contextName
  const autoExecLines = config.environment && config.environment.autoExecLines
  const sharedAccountId = config.attributes && config.attributes.runServerAs

  const createdContext = await sasjs
    .createContext(
      name,
      launchName,
      sharedAccountId,
      autoExecLines,
      accessToken
    )
    .catch((err) => {
      displayResult(err, 'An error has occurred when processing context.', null)
    })

  if (createdContext) {
    displayResult(
      null,
      null,
      `Context '${name}' with id '${createdContext.id}' successfully created!`
    )
  }
}
