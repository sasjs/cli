import { folderExists, createFolder, createFile } from '@sasjs/utils'
import path from 'path'
import { parseLogLines, displaySuccess } from '.'
import { LogJson } from '../types'

/**
 * Saves log to the log file.
 * @param logData - log content.
 * @param logFile - file path to log file.
 * @param jobPath - file path to job, job name will be used as a fallback name for log file.
 * @param silent - boolean indicating if additional info should be logged.
 */
export const saveLog = async (
  logData: LogJson | string,
  logFile: string | undefined,
  jobPath: string,
  silent: boolean = false
) => {
  // throw an error if log is an object containing error property
  if (typeof logData !== 'string') {
    const { error } = logData

    if (error) throw JSON.stringify(error, null, 2)
  }

  // get absolute file path to log file
  const logPath =
    logFile ||
    path.join(
      process.projectDir,
      `${jobPath.split(path.sep).slice(-1).pop()}.log`
    )

  const folderPath = logPath.split(path.sep)
  folderPath.pop()

  const parentFolderPath = folderPath.join(path.sep)

  // create parent folder of the log file if it doesn't exist
  if (!(await folderExists(parentFolderPath))) {
    await createFolder(parentFolderPath)
  }

  // try to parse log
  const logLines =
    typeof logData === 'object' ? parseLogLines(logData) : logData

  if (!silent) process.logger?.info(`Creating log file at ${logPath} .`)

  await createFile(logPath, logLines)

  if (!silent) displaySuccess(`Log saved to ${logPath}`)
}
