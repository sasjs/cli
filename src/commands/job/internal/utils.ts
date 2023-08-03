import path from 'path'
import { createFile, createFolder, folderExists } from '@sasjs/utils'
import { parseLogLines } from '../../../utils/utils'
import { displayError, displaySuccess } from '../../../utils/displayResult'

/**
 * Saves log to a file.
 * @param logData - log content.
 * @param logFile - file path to log file.
 * @param jobPath - file path to the job submitted for execution.
 */
export const saveLog = async (
  logData: any,
  logFile: string | undefined,
  jobPath: string
) => {
  let logPath

  // use provide file path to log file
  if (logFile) {
    logPath = logFile
  }
  // use file path based on job file path
  // the same file name will be used, but with *.log extension
  else {
    logPath = path.join(
      process.projectDir,
      `${jobPath.split(path.sep).slice(-1).pop()}.log`
    )
  }

  const folderPath = logPath.split(path.sep)
  folderPath.pop()
  const parentFolderPath = folderPath.join(path.sep)

  // create parent folder of log file
  if (!(await folderExists(parentFolderPath))) {
    await createFolder(parentFolderPath)
  }

  // try to parse log by lines
  const logLines =
    typeof logData === 'object' ? parseLogLines(logData) : logData

  await createFile(logPath, logLines)

  displaySuccess(`Log saved to ${logPath}`)
}

/**
 * Saves job output to the file.
 * @param outputData - job output.
 * @param outputFile - file path to output file.
 */
export const saveOutput = async (outputData: any, outputFile: string) => {
  // try to convert job output into a string
  try {
    outputData = JSON.stringify(outputData, null, 2)
  } catch (error) {
    displayError(
      error,
      'An error has occurred when parsing the output of the job.'
    )
  }

  // get absolute file path
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

  // create parent folder of output file
  if (!(await folderExists(parentFolderPath))) {
    await createFolder(parentFolderPath)
  }

  await createFile(outputPath, outputData)

  displaySuccess(`Output saved to: ${outputPath}`)
}
