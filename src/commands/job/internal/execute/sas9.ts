import path from 'path'
import SASjs from '@sasjs/adapter/node'
import { MacroVars, createFile, createFolder, folderExists } from '@sasjs/utils'
import { displayError, displaySuccess } from '../../../../utils/displayResult'
import { saveLog, saveOutput } from '../utils'
import { parseSourceFile } from '../../../../utils/parseSourceFile'

/**
 * Triggers an existing Stored Process for execution as a "job".  See online documentation here: https://cli.sasjs.io/job/
 * @param {object} sasjs - Configuration object of the SASJS adapter.
 * @param {object} config - An object containing the username and password for authentication.
 * @param {string} jobPath - Location of the Stored Process in SAS metadata (_program).
 * @param {string | undefined} logFile - If provided, the CLI will write the log here.
 * @param {string | undefined} output - If provided, and valid JSON is returned (ie using the SASjs macros), it will be written to this file location.
 * @param {string | undefined} source - An optional path to a JSON file containing input macro variables.
 */
export async function executeJobSas9(
  sasjs: SASjs,
  config: { userName: string; password: string },
  jobPath: string,
  logFile?: string,
  output?: string,
  source?: string
) {
  let macroVars: MacroVars | null = null

  if (source) {
    macroVars = await parseSourceFile(source)
  }

  const startTime = new Date().getTime()

  const result = await sasjs.request(jobPath, macroVars, config)

  const endTime = new Date().getTime()

  if (result) {
    if (result.status === 200) {
      process.logger.success(
        `Job executed successfully! in ${(endTime - startTime) / 1000} seconds`
      )

      if (!!logFile && result.log) {
        await saveLog(result.log, logFile, jobPath, false)
      }

      if (!!output && result.result) {
        saveOutput(result.result, output, false)
      }
    } else {
      process.logger.error(result.message)
      process.logger.error(JSON.stringify(result.error, null, 2))
    }
  }

  return result
}
