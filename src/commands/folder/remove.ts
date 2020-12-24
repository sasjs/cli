import SASjs from '@sasjs/adapter/node'
import { displayError, displaySuccess } from '../../utils/displayResult'

/**
 * Deletes folder.
 * @param {string} path - folder path.
 * @param {object} sasjs - configuration object of SAS adapter.
 * @param {string} accessToken - an access token for an authorized user.
 */
export const remove = async (
  path: string,
  sasjs: SASjs,
  accessToken: string
) => {
  const deletedFolder = await sasjs
    .deleteFolder(path, accessToken)
    .catch((err) => {
      displayError(err, `Error deleting folder ${path}`)
    })

  if (deletedFolder) {
    displaySuccess(`Folder '${path}' has been moved to 'Recycle Bin'.`)
    return Promise.resolve(true)
  }
  return Promise.reject()
}
