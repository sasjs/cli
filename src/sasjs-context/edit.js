import SASjs from '@sasjs/adapter/node'
import { displayResult } from '../utils/displayResult'
import { getAccessToken } from '../utils/config-utils'

/**
 * Edits existing compute context.
 * @param {string} configName - name of the config to edit.
 * @param {object} config - context configuration.
 * @param {object} target - SAS server configuration.
 */
export async function edit(configName, config, target) {
  const sasjs = new SASjs({
    serverUrl: target.serverUrl,
    serverType: target.serverType
  })

  const accessToken = await getAccessToken(target).catch((err) => {
    displayResult(err)
  })

  const name = configName || config.name

  delete config.id

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
