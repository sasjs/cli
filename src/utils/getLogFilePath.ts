import path from 'path'

export const getLogFilePath = (logArg: unknown, jobPath: string) => {
  if (logArg === undefined || !jobPath || jobPath === '') return undefined

  if (logArg) {
    const currentDirPath = path.isAbsolute(logArg as string)
      ? ''
      : process.projectDir

    return path.join(currentDirPath, logArg as string)
  }

  const logFileName = `${jobPath.split(path.sep).slice(-1).pop()}.log`

  return path.join(process.projectDir, logFileName)
}
