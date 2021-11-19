import SASjs from '@sasjs/adapter/node'
import { saveLog } from '../utils'

export async function executeJobSasjs(
  sasjs: SASjs,
  jobPath: string,
  logFile: string | undefined
) {
  const result = await sasjs.executeJobSASjs({
    _program: jobPath
  })

  if (result) {
    if (result.status === 'success') {
      process.logger.success('Job executed successfully!')

      if (logFile && result.log) {
        await saveLog(result.log, logFile, jobPath, false)
      }
    } else {
      process.logger.error(result.message)
      process.logger.error(JSON.stringify(result.error, null, 2))
    }
  }

  return result
}
