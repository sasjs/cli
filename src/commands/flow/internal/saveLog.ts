import SASjs from '@sasjs/adapter/node'
import { createFile, fileExists, generateTimestamp } from '@sasjs/utils'
import path from 'path'
import { displayError } from '../../../utils/displayResult'
import { parseLogLines } from '../../../utils/utils'
import { fetchLogFileContent } from '../../shared/fetchLogFileContent'
import { generateFileName } from './generateFileName'

/**
 * A job's log, both as written and as text.
 *
 * The caller checks the text after the file is on disk: a job whose log fails
 * the check is exactly the job whose log is wanted for reading, so writing it
 * first is the difference between a diagnosable failure and an empty folder.
 */
export interface SavedFlowLog {
  fileName: string | null
  logText: string
}

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
): Promise<SavedFlowLog> => {
  if (!logFolder) throw 'No log folder provided'
  if (!links) throw 'No links provided'

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
    )

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

    return { fileName: logName, logText: logParsed }
  }

  return { fileName: null, logText: '' }
}
