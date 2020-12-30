import SASjs from '@sasjs/adapter/node'
import { displayError, displaySuccess } from '../../utils/displayResult'

/**
 * Removes compute context.
 * @param {string} contextName - name of the context to delete.
 * @param {object} sasjs - configuration object of SAS adapter.
 * @param {string} accessToken - an access token for an authorized user.
 */
export async function remove(
  contextName: string,
  sasjs: SASjs,
  accessToken: string
) {
  let result

  const deletedContext = await sasjs
    .deleteContext(contextName, accessToken)
    .catch((err) => {
      result = err

      displayError(
        err,
        `An error has occurred when deleting context '${contextName}'.`
      )
    })

  if (deletedContext) {
    result = true

    displaySuccess(`Context '${contextName}' has been deleted!`)
  }

  return result
}
