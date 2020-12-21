import { displayResult } from '../../utils/displayResult'

/**
 * Creates compute context using provided config.
 * @param {object} config - context configuration.
 * @param {object} sasjs - configuration object of SAS adapter.
 * @param {string} accessToken - an access token for an authorized user.
 */
export async function create(config, sasjs, accessToken) {
  const { name } = config
  const launchName = config.launchContext && config.launchContext.contextName
  const autoExecLines = config.environment && config.environment.autoExecLines
  const sharedAccountId = config.attributes && config.attributes.runServerAs

  let result

  const createdContext = await sasjs
    .createLauncherContext(
      name,
      launchName,
      sharedAccountId,
      autoExecLines,
      accessToken
    )
    .catch((err) => {
      displayResult(err, 'An error has occurred when processing context.', null)

      result = err
    })

  if (createdContext) {
    result = true

    displayResult(
      null,
      null,
      `Context '${name}' with id '${createdContext.id}' successfully created!`
    )
  }

  return result
}
