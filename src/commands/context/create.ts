import SASjs from '@sasjs/adapter/node'
import { displayError, displaySuccess } from '../../utils/displayResult'

/**
 * Creates compute context using provided config.
 * @param {object} config - context configuration.
 * @param {object} sasjs - configuration object of SAS adapter.
 * @param {string} accessToken - an access token for an authorized user.
 */
export async function create(config: any, sasjs: SASjs, accessToken: string) {
  const { name } = config
  const launchName = config.launchContext && config.launchContext.contextName
  const autoExecLines = config.environment && config.environment.autoExecLines
  const sharedAccountId = config.attributes && config.attributes.runServerAs

  const createdContext = await sasjs
    .createComputeContext(
      name,
      launchName,
      sharedAccountId,
      autoExecLines,
      accessToken
    )
    .catch((err) => {
      process.logger?.error('Error creating context: ', err)
      throw err
    })

  if (createdContext) {
    displaySuccess(
      `Context '${name}' with id '${createdContext.id}' successfully created!`
    )
  }
}
