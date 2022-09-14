import { folderExists, createFolder, createFile } from '@sasjs/utils'
import path from 'path'
import { parseLogLines, displaySuccess } from '.'

export const saveLog = async (
  logData: any,
  logFile: string | undefined,
  jobPath: string,
  returnStatusOnly: boolean,
  silent: boolean = false
) => {
  let logPath

  if (logFile) {
    logPath = logFile
  } else {
    logPath = path.join(
      process.projectDir,
      `${jobPath.split(path.sep).slice(-1).pop()}.log`
    )
  }

  let folderPath = logPath.split(path.sep)
  folderPath.pop()
  const parentFolderPath = folderPath.join(path.sep)

  if (!(await folderExists(parentFolderPath))) {
    await createFolder(parentFolderPath)
  }

  let logLines = typeof logData === 'object' ? parseLogLines(logData) : logData

  if (!silent) process.logger?.info(`Creating log file at ${logPath} .`)
  await createFile(logPath, logLines)

  if (!returnStatusOnly && !silent) displaySuccess(`Log saved to ${logPath}`)
}
