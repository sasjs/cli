import { displayResult } from '../../utils/displayResult'

/**
 * Removes compute context.
 * @param {string} contextName - name of the context to delete.
 * @param {object} sasjs - configuration object of SAS adapter.
 * @param {string} accessToken - an access token for an authorized user.
 */
export async function remove(contextName, sasjs, accessToken) {
  let result

  const deletedContext = await sasjs
    .deleteContext(contextName, accessToken)
    .catch((err) => {
      result = err

      displayResult(
        err,
        `An error has occurred when deleting context '${contextName}'.`,
        null
      )
    })

  if (deletedContext) {
    result = true

    displayResult(null, null, `Context '${contextName}' has been deleted!`)
  }

  return result
}
