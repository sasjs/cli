import SASjs from '@sasjs/adapter/node'

/**
 * Removes compute context.
 * @param {string} contextName - name of the context to delete.
 * @param {object} sasjs - configuration object of SAS adapter.
 * @param {string} accessToken - an access token for an authorized user.
 */
export async function deleteContext(
  contextName: string,
  sasjs: SASjs,
  accessToken: string
) {
  const deletedContext = await sasjs
    .deleteComputeContext(contextName, accessToken)
    .catch((err) => {
      process.logger?.error(`Error deleting context '${contextName}': `, err)
      throw err
    })

  if (deletedContext) {
    process.logger?.success(`Context '${contextName}' has been deleted!`)
  }
}
