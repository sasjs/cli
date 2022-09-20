import path from 'path'
import { createFile, createFolder, folderExists } from '@sasjs/utils'
import { parseLogLines } from '../../../utils/utils'
import { displayError, displaySuccess } from '../../../utils/displayResult'

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
      `${jobPath.split(path.sep).slice(-1).pop()}.log`
    )
  }

  const folderPath = logPath.split(path.sep)
  folderPath.pop()
  const parentFolderPath = folderPath.join(path.sep)

  if (!(await folderExists(parentFolderPath))) {
    await createFolder(parentFolderPath)
  }

  const logLines =
    typeof logData === 'object' ? parseLogLines(logData) : logData

  await createFile(logPath, logLines)

  if (!returnStatusOnly) displaySuccess(`Log saved to ${logPath}`)
}

export const saveOutput = async (
  outputData: any,
  outputFile: string,
  returnStatusOnly: boolean
) => {
  try {
    outputData = JSON.stringify(outputData, null, 2)
  } catch (error) {
    displayError(
      error,
      'An error has occurred when parsing the output of the job.'
    )
  }

  const currentDirPath = path.isAbsolute(outputFile) ? '' : process.projectDir
  const outputPath = path.join(
    currentDirPath,
    /\.[a-z]{3,4}$/i.test(outputFile)
      ? outputFile
      : path.join(outputFile, 'output.json')
  )

  const folderPath = outputPath.split(path.sep)
  folderPath.pop()
  const parentFolderPath = folderPath.join(path.sep)

  if (!(await folderExists(parentFolderPath))) {
    await createFolder(parentFolderPath)
  }

  await createFile(outputPath, outputData)

  if (!returnStatusOnly) displaySuccess(`Output saved to: ${outputPath}`)
}
