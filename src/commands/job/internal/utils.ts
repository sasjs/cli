import path from 'path'
import { createFile, createFolder, folderExists } from '@sasjs/utils'
import { parseLogLines } from '../../../utils/utils'
import { displaySuccess } from '../../../utils/displayResult'

export const saveLog = async (
  logData: any,
  logFile: string | undefined,
  jobPath: string,
  returnStatusOnly: boolean
) => {
  let logPath

  if (logFile) {
    logPath = logFile
  } else {
    logPath = path.join(
      process.projectDir,
      `${jobPath.split('/').slice(-1).pop()}.log`
    )
  }

  let folderPath = logPath.split(path.sep)
  folderPath.pop()
  const parentFolderPath = folderPath.join(path.sep)

  if (!(await folderExists(parentFolderPath))) {
    await createFolder(parentFolderPath)
  }

  let logLines = typeof logData === 'object' ? parseLogLines(logData) : logData

  process.logger?.info(`Creating log file at ${logPath} .`)
  await createFile(logPath, logLines)

  if (!returnStatusOnly) displaySuccess(`Log saved to ${logPath}`)
}
