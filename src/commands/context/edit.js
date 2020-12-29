import { displayResult } from '../../utils/displayResult'

/**
 * Edits existing compute context.
 * @param {string} configName - name of the config to edit.
 * @param {object} config - context configuration.
 * @param {object} sasjs - configuration object of SAS adapter.
 * @param {string} accessToken - an access token for an authorized user.
 */
export async function edit(configName, config, sasjs, accessToken) {
  const name = configName || config.name

  delete config.id

  let result

  const editedContext = await sasjs
    .editComputeContext(name, config, accessToken)
    .catch((err) => {
      result = err

      displayResult(err, 'An error has occurred when processing context.', null)
    })

  if (editedContext) {
    result = true
    const editedContextName = editedContext.result.name || ''

    displayResult(
      null,
      null,
      `Context '${editedContextName}' successfully updated!`
    )
  }

  return result
}
