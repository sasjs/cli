import SASjs from '@sasjs/adapter/node'
import { LogLevel, Logger } from '@sasjs/utils/logger'
import { displayResult } from '../../utils/displayResult'

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
  const logLevel = (process.env.LOG_LEVEL || LogLevel.Error) as LogLevel
  const logger = new Logger(logLevel)
  const pathMap = paths.split(' ')

  if (pathMap.length !== 2) {
    logger.error(
      `Bad command.\nCommand example: sasjs folder move /Public/sourceFolder /Public/targetFolder`
    )

    return
  }

  const sourceFolder = pathMap[0]
  let targetFolder = pathMap[1].split('/')
  const targetFolderName = targetFolder.pop() as string
  const parentFolder = targetFolder.join('/')

  const movedFolder = await sasjs
    .moveFolder(sourceFolder, parentFolder, targetFolderName, accessToken)
    .catch((err) => {
      displayResult(err)
    })

  if (movedFolder) {
    displayResult(
      null,
      null,
      `Folder successfully moved from '${sourceFolder}' to '${
        targetFolder + '/' + targetFolderName
      }'.`
    )
  }
}
