import { displaySuccess, displayError } from '../../utils/displayResult'
import chalk from 'chalk'
import SASjs from '@sasjs/adapter/node'

/**
 * Lists folder children
 * @param {string} path - folder path.
 * @param {object} sasjs - configuration object of SAS adapter.
 * @param {string} accessToken - an access token for an authorized user.
 */
export const list = async (
  path: string,
  sasjs: SASjs,
  accessToken: string
): Promise<string> => {
  const sourceFolder = path

  const folderList = await sasjs
    .listFolder(sourceFolder, accessToken, 10000)
    .catch((err: any) => {
      displayError(err)
    })

  if (folderList) {
    // Join array with comma and then replace every comma with 3 spaces
    const folderFormattedList = folderList.join(',').replace(/,/gim, '   ')
    displaySuccess(folderFormattedList)

    return Promise.resolve(folderFormattedList)
  }

  return Promise.reject('')
}
