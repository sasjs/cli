import SASjs from '@sasjs/adapter/node'
import { displayError, displaySuccess } from '../../utils/displayResult'

/**
 * Moves folder to a new location.
 * @param {string} paths - folder paths (source path and destination path separated by space).
 * @param {object} sasjs - configuration object of SAS adapter.
 * @param {string} accessToken - an access token for an authorized user.
 */
export const move = async (
  paths: string,
  sasjs: SASjs,
  accessToken: string
) => {
  const pathMap = paths.split(' ')

  if (pathMap.length !== 2) {
    throw new Error(
      `Bad command.\nCommand example: sasjs folder move /Public/sourceFolder /Public/targetFolder`
    )
  }

  const sourceFolder = pathMap[0]
  let targetFolder = pathMap[1]
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
