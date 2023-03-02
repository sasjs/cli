import path from 'path'
import {
  executeShellScript,
  executePowerShellScript
} from '../../../utils/utils'
import { isShellScript, isPowerShellScript } from '../../../utils/file'

export async function executeNonSasScript(scriptPath: string) {
  const fileExtension = path.extname(scriptPath)

  const { buildDestinationResultsLogsFolder } = process.sasjsConstants

  const logPath = path.join(
    buildDestinationResultsLogsFolder,
    path.basename(scriptPath).replace(fileExtension, '.log')
  )

  if (isShellScript(scriptPath)) {
    process.logger?.info(`Executing shell script ${scriptPath} ...`)

    await executeShellScript(scriptPath, logPath)

    process.logger?.success(
      `Shell script execution completed! Log is here: ${logPath}`
    )

    return
  }

  if (isPowerShellScript(scriptPath)) {
    process.logger?.info(`Executing powershell script ${scriptPath} ...`)

    await executePowerShellScript(scriptPath, logPath)

    process.logger?.success(
      `PowerShell script execution completed! Log is here: ${logPath}`
    )

    return
  }

  process.logger?.error(`Unable to process script located at ${scriptPath}`)
}
