import SASjs from '@sasjs/adapter/node'
import { displayError, displaySuccess } from '../../utils/displayResult'

/**
 * Edits existing compute context.
 * @param {string} configName - name of the config to edit.
 * @param {object} config - context configuration.
 * @param {object} sasjs - configuration object of SAS adapter.
 * @param {string} accessToken - an access token for an authorized user.
 */
export async function edit(
  configName: string | null,
  config: any,
  sasjs: SASjs,
  accessToken: string
) {
  const name = configName || config.name

  delete config.id

  const editedContext = await sasjs
    .editComputeContext(name, config, accessToken)
    .catch((err) => {
      process.logger?.error('Error editing context: ', err)
      throw err
    })

  if (editedContext) {
    const editedContextName = editedContext.result.name || ''

    process.logger?.success(
      `Context '${editedContextName}' successfully updated!`
    )
  }
}
