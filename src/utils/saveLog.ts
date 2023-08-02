import { folderExists, createFolder, createFile } from '@sasjs/utils'
import path from 'path'
import { parseLogLines, displaySuccess } from '.'
import { LogJson } from '../types'

export const saveLog = async (
  logData: LogJson | string,
  logFile: string | undefined,
  jobPath: string,
  silent: boolean = false
) => {
  if (typeof logData !== 'string') {
    const { error } = logData

    if (error) throw JSON.stringify(error, null, 2)
  }

  const logPath =
    logFile ||
    path.join(
      process.projectDir,
      `${jobPath.split(path.sep).slice(-1).pop()}.log`
    )

  const folderPath = logPath.split(path.sep)
  folderPath.pop()

  const parentFolderPath = folderPath.join(path.sep)

  if (!(await folderExists(parentFolderPath))) {
    await createFolder(parentFolderPath)
  }

  const logLines =
    typeof logData === 'object' ? parseLogLines(logData) : logData

  if (!silent) process.logger?.info(`Creating log file at ${logPath} .`)
  await createFile(logPath, logLines)

  if (!silent) displaySuccess(`Log saved to ${logPath}`)
}
