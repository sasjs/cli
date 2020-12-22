import { displayResult } from '../../utils/displayResult'
import chalk from 'chalk'

/**
 * Moves folder to a new location.
 * @param {string} paths - folder paths (source path and destination path separated by space).
 * @param {object} sasjs - configuration object of SAS adapter.
 * @param {string} accessToken - an access token for an authorized user.
 */
export const move = async (paths, sasjs, accessToken) => {
  const pathMap = paths.split(' ')

  if (pathMap.length !== 2) {
    console.log(
      chalk.redBright(
        `Bad command.\nCommand example: sasjs folder move /Public/sourceFolder /Public/targetFolder`
      )
    )

    return
  }

  const sourceFolder = pathMap[0]
  let targetFolder = pathMap[1]
  const targetFolderName = targetFolder.split('/').pop()

  console.log({
    sourceFolder,
    targetFolder,
    targetFolderName
  })

  const movedFolder = await sasjs
    .moveFolder(sourceFolder, targetFolder, targetFolderName, accessToken)
    .catch((err) => {
      displayResult(err)
    })

  if (movedFolder) {
    displayResult(
      null,
      null,
      `Folder successfully moved from '${sourceFolder}' to '${targetFolder}'.`
    )
  }
}
