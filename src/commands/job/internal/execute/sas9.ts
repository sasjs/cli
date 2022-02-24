import path from 'path'
import SASjs from '@sasjs/adapter/node'
import {
  MacroVars,
  isMacroVars,
  fileExists,
  readFile,
  createFile,
  createFolder,
  folderExists
} from '@sasjs/utils'
import { isJsonFile } from '../../../../utils/file'
import { displayError, displaySuccess } from '../../../../utils/displayResult'
import { saveLog } from '../utils'

/**
 * Triggers an existing Stored Process for execution as a "job".  See online documentation here: https://cli.sasjs.io/job/
 * @param {object} sasjs - Configuration object of the SASJS adapter.
 * @param {object} config - An object containing the username and password for authentication.
 * @param {string} jobPath - Location of the Stored Process in SAS metadata (_program).
 * @param {string | undefined} logFile - If provided, the CLI will write the log here.
 * @param {string | string} output - If provided, and valid JSON is returned (ie using the SASjs macros), it will be written to this file location.
 * @param {string | undefined} source - An optional path to a JSON file containing input macro variables.
 */
export async function executeJobSas9(
  sasjs: SASjs,
  config: { username: string; password: string },
  jobPath: string,
  logFile?: string,
  output?: string,
  source?: string
) {
  let macroVars: MacroVars | null = null

  if (source) {
    if (!isJsonFile(source)) throw 'Source file has to be JSON.'

    await fileExists(source).catch((_) => {
      throw 'Error while checking if source file exists.'
    })

    source = await readFile(source).catch((_) => {
      throw 'Error while reading source file.'
    })

    macroVars = JSON.parse(source as string) as MacroVars

    if (!isMacroVars(macroVars)) {
      throw `Provided source is not valid. An example of valid source:
{ macroVars: { name1: 'value1', name2: 'value2' } }`
    }
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
        try {
          const outputJson = JSON.stringify(result.result, null, 2)

          const currentDirPath = path.isAbsolute(output)
            ? ''
            : process.projectDir
          const outputPath = path.join(
            currentDirPath,
            /\.[a-z]{3,4}$/i.test(output)
              ? output
              : path.join(output, 'output.json')
          )

          let folderPath = outputPath.split(path.sep)
          folderPath.pop()
          const parentFolderPath = folderPath.join(path.sep)

          if (!(await folderExists(parentFolderPath)))
            await createFolder(parentFolderPath)

          await createFile(outputPath, outputJson)

          displaySuccess(`Output saved to: ${outputPath}`)
        } catch (error) {
          displayError(
            error,
            'An error has occurred when parsing an output of the job.'
          )
        }
      }
    } else {
      process.logger.error(result.message)
      process.logger.error(JSON.stringify(result.error, null, 2))
    }
  }

  return result
}
