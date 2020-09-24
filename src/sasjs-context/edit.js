import SASjs from '@sasjs/adapter/node'
import { displayResult } from '../utils/displayResult'
import { getAccessToken } from '../utils/config-utils'

/**
 * Edits existing compute context.
 * @param {object} config - context configuration.
 * @param {object} target - SAS server configuration.
 */
export async function edit(config, target) {
  const sasjs = new SASjs({
    serverUrl: target.serverUrl,
    serverType: target.serverType
  })

  const accessToken = await getAccessToken(target).catch((err) => {
    displayResult(err)
  })

  const { name } = config

  const editedContext = await sasjs
    .editContext(name, config, accessToken)
    .catch((err) => {
      displayResult(err, 'An error has occurred when processing context.', null)
    })

  if (editedContext) {
    const editedContextName = editedContext.result.name || ''

    displayResult(
      null,
      null,
      `Context '${editedContextName}' successfully updated!`
    )
  }
}
