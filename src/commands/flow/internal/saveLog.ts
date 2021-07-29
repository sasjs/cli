import SASjs from '@sasjs/adapter/node'
import { createFile, fileExists, generateTimestamp } from '@sasjs/utils'
import path from 'path'
import { displayError } from '../../../utils/displayResult'
import { parseLogLines } from '../../../utils/utils'
import { fetchLogFileContent } from '../../shared/fetchLogFileContent'
import { generateFileName } from './generateFileName'

// REFACTOR: move to utility
export const saveLog = async (
  links: any[],
  flowName: string,
  jobLocation: string,
  logFolder: string,
  sasjs: SASjs,
  serverUrl: string,
  access_token: string,
  lineCount: number = 1000000
) => {
  return new Promise(async (resolve, reject) => {
    if (!logFolder) return reject('No log folder provided')
    if (!links) return reject('No links provided')

    const logObj = links.find(
      (link: any) => link.rel === 'log' && link.method === 'GET'
    )

    if (logObj) {
      const logUrl = serverUrl + logObj.href

      const logJson = await fetchLogFileContent(
        sasjs,
        access_token,
        logUrl,
        lineCount
      ).catch((err) => Promise.reject(err))

      const logParsed = parseLogLines(logJson)

      let logName = generateFileName(flowName, jobLocation)

      while (
        await fileExists(path.join(logFolder, logName)).catch((err) =>
          displayError(err, 'Error while checking if log file exists.')
        )
      ) {
        logName = generateFileName(flowName, jobLocation)
      }

      await createFile(path.join(logFolder, logName), logParsed).catch((err) =>
        displayError(err, 'Error while creating log file.')
      )

      return resolve(logName)
    }

    return resolve(null)
  })
}
