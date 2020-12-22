import { displayResult } from '../../utils/displayResult'
import chalk from 'chalk'

/**
 * Lists folder children
 * @param {string} path - folder path.
 * @param {object} sasjs - configuration object of SAS adapter.
 * @param {string} accessToken - an access token for an authorized user.
 */
export const list = async (path, sasjs, accessToken) => {
  const sourceFolder = path

  const folderList = await sasjs
    .listFolder(sourceFolder, accessToken)
    .catch((err) => {
      displayResult(err)
    })

  if (folderList) {
    // Join array with comma and then replace every comma with 3 spaces
    let folderFormattedList = folderList.join(',').replace(/,/gim, '   ')

    displayResult(null, null, folderFormattedList)
  }
}
