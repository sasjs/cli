import SASjs from '@sasjs/adapter/node'
import chalk from 'chalk'
import { displayResult } from '../../utils/displayResult'

/**
 * Creates folder.
 * @param {string} path - folder path.
 * @param {object} sasjs - configuration object of SAS adapter.
 * @param {string} accessToken - an access token for an authorized user.
 * @param {boolean} isForced - forced flag indicates if target folder already exists, its content and all subfolders will be deleted.
 */
export const create = async (
  path: string,
  sasjs: SASjs,
  accessToken: string,
  isForced: boolean
) => {
  const pathMap = path.split('/')
  const folder = sanitize(pathMap.pop() || '')
  let parentFolderPath = pathMap.join('/')

  const createdFolder = await sasjs
    .createFolder(
      folder,
      parentFolderPath,
      undefined,
      accessToken,
      undefined,
      isForced
    )
    .catch((err) => {
      displayResult(err)

      if (err.status && err.status === 409) {
        console.log(
          chalk.redBright(
            `Consider using '-f' or '--force' flag, eg 'sasjs folder create /Public/folderToCreate -f'.\nWARNING: When using force, any existing content and subfolders of the target folder will be deleted.`
          )
        )
      }
    })

  if (createdFolder) {
    displayResult(
      null,
      null,
      `Folder '${
        parentFolderPath + '/' + folder
      }' has been successfully created.`
    )
  }
}

const sanitize = (path: string) => path.replace(/[^0-9a-zA-Z_\-. ]/g, '_')
