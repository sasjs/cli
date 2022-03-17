import path from 'path'
import { isSASjsProject } from './utils'

export const getLogFilePath = async (logArg: unknown, jobPath: string) => {
  if (logArg === undefined || !jobPath || jobPath === '') return undefined

  if (logArg) {
    const currentDirPath = path.isAbsolute(logArg as string)
      ? ''
      : process.projectDir

    return path.join(currentDirPath, logArg as string)
  }

  const logFileName = `${jobPath.split('/').slice(-1).pop()}.log`
  return (await isSASjsProject())
    ? path.join(
        process.sasjsConstants.buildDestinationResultsFolder,
        logFileName
      )
    : path.join(process.projectDir, logFileName)
}
