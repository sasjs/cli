import SASjs from '@sasjs/adapter/node'

/**
 * Deletes folder.
 * @param {string} path - folder path.
 * @param {object} sasjs - configuration object of SAS adapter.
 * @param {string} accessToken - an access token for an authorized user.
 */
export const deleteFolder = async (
  path: string,
  sasjs: SASjs,
  accessToken: string
) => {
  const deletedFolder = await sasjs
    .deleteFolder(path, accessToken)
    .catch((err) => {
      process.logger?.error(`Error deleting folder ${path}: `, err)
      throw err
    })

  if (deletedFolder) {
    process.logger?.success(`Folder '${path}' has been moved to 'Recycle Bin'.`)
  }
}
