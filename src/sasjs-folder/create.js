import chalk from 'chalk'
import { displayResult } from '../utils/displayResult'

/**
 * Creates folder.
 * @param {string} path - folder path.
 * @param {object} sasjs - SAS adapter.
 * @param {string} accessToken - an access token for an authorized user.
 * @param {boolean} isForced - forced flag indicates if target folder already exists, its content and all subfolders will be deleted.
 */
export const create = async (path, sasjs, accessToken, isForced) => {
  const pathMap = path.split('/')
  const folder = sanitize(pathMap.pop())
  let parentFolderPath = pathMap.join('/')

  const createdFolder = await sasjs
    .createFolder(folder, parentFolderPath, null, accessToken, null, isForced)
    .catch((err) => {
      displayResult(err)

      if (err.status && err.status === 409) {
        console.log(
          chalk.redBright(
            `Consider using '-f' or '--force' flag (eg sasjs folder create /Public/folderToCreate -f).\nNOTE: content and all subfolders of initial folder will be deleted.`
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

const sanitize = (path) => path.replace(/[^0-9a-zA-Z_\-. ]/g, '_')
