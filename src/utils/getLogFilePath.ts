import path from 'path'

export const getLogFilePath = (logArg: unknown, jobPath: string) => {
  if (logArg === undefined) {
    return undefined
  }

  if (logArg) {
    const currentDirPath = path.isAbsolute(logArg as string)
      ? ''
      : process.projectDir
    return path.join(currentDirPath, logArg as string)
  }

  const logFileName = `${jobPath.split('/').slice(-1).pop()}.log`
 
  if (logArg === '') return path.join(process.projectDir, 'sasjsbuild', logFileName)

  return path.join(process.projectDir, logFileName)
}
