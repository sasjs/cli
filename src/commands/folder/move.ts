import SASjs from '@sasjs/adapter/node'
import { displayError, displaySuccess } from '../../utils/displayResult'

/**
 * Moves folder to a new location.
 * @param {string} paths - folder paths (source path and destination path separated by space).
 * @param {object} sasjs - configuration object of SAS adapter.
 * @param {string} accessToken - an access token for an authorized user.
 */
export const move = async (
  sourcePath: string,
  destinationPath: string,
  sasjs: SASjs,
  accessToken: string
) => {
  const sourceFolder = sourcePath
  let targetFolder = destinationPath
  const targetFolderName = targetFolder.split('/').pop() as string

  const movedFolder = await sasjs
    .moveFolder(sourceFolder, targetFolder, targetFolderName, accessToken)
    .catch((err: any) => {
      displayError(err, `An error occurred when moving folder ${sourceFolder}.`)
    })

  if (movedFolder) {
    displaySuccess(
      `Folder successfully moved from '${sourceFolder}' to '${targetFolder}'.`
    )
  }
}
