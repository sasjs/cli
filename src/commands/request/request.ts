import path from 'path'
import SASjs, { SASjsRequest } from '@sasjs/adapter/node'
import {
  readFile,
  folderExists,
  createFile,
  createFolder,
  decodeFromBase64,
  getAbsolutePath,
  generateTimestamp
} from '@sasjs/utils'
import { displayError, displaySuccess } from '../../utils/displayResult'
import { AuthConfig, ServerType, Target } from '@sasjs/utils/types'
import { displaySasjsRunnerError, isSASjsProject } from '../../utils/utils'
import { saveLog } from '../../utils/saveLog'

export async function runSasJob(
  target: Target,
  isLocal: boolean,
  sasJobLocation: string,
  dataFilePath?: string,
  configFilePath?: string,
  authConfig?: AuthConfig,
  logFile?: string,
  jobPath?: string | null,
  outputPathParam?: string | undefined
) {
  let dataJson: any = null
  let configJson: any = {}

  if (dataFilePath) {
    dataJson = {}

    if (dataFilePath.split('.').slice(-1)[0] !== 'json') {
      throw new Error('Provided data file must be valid json.')
    }

    const dataFile = await readFile(
      getAbsolutePath(dataFilePath, process.projectDir)
    )

    try {
      dataJson = JSON.parse(dataFile)
    } catch (err) {
      throw new Error('Provided data file must be valid json.')
    }
  }

  if (configFilePath) {
    if (configFilePath.split('.').slice(-1)[0] !== 'json') {
      throw new Error('Provided config file must be valid json.')
    }

    const configFile = await readFile(
      getAbsolutePath(configFilePath, process.projectDir)
    )

    try {
      configJson = JSON.parse(configFile)
    } catch (err) {
      throw new Error('Provided config file must be valid json.')
    }
  }

  if (target.serverType === ServerType.Sas9) {
    if (target.authConfigSas9) {
      configJson.username = target.authConfigSas9.userName
      configJson.password = target.authConfigSas9.password
    } else {
      configJson.username = process.env.SAS_USERNAME
      configJson.password = process.env.SAS_PASSWORD
    }

    if (!configJson.username || !configJson.password) {
      const { sas9CredentialsError } = process.sasjsConstants
      throw new Error(sas9CredentialsError)
    }
    configJson.password = decodeFromBase64(configJson.password)
  }

  const sasjs = new SASjs({
    serverUrl: target.serverUrl,
    httpsAgentOptions: target.httpsAgentOptions,
    appLoc: target.appLoc,
    serverType: target.serverType,
    contextName: target.contextName,
    useComputeApi: false,
    debug: true
  })

  let result

  await sasjs
    .request(sasJobLocation, dataJson, configJson, undefined, authConfig)
    .then(async (res: any) => {
      if ((res && res.errorCode) || res.error) {
        displayError('Request finished with errors.')
        await saveLogFile(sasjs, sasJobLocation, logFile, jobPath)
        return
      }

      let output = ''

      if (res?.result) res = res.result
      // In sasjs request debug is always on, meaning the response object always contains the log
      // This log goes to a seperate .log file, and should not be added to the output file (*.json)
      // Therefore, we delete it now from the result object
      else if (res?.log) delete res.log

      // Sometimes res.result contains the log (eg when there is a SAS error)
      // Here we make sure that the content in the output file (*.json) will be in json format
      if (typeof res === 'string') {
        try {
          output = JSON.parse(res)
        } catch (error) {
          displayError('Error parsing response. JSON is expected.')
        }
      } else {
        output = res
      }

      if (!!output) await writeOutput(outputPathParam, output, sasJobLocation)

      await saveLogFile(sasjs, sasJobLocation, logFile, jobPath)
      result = true
    })
    .catch(async (err: any) => {
      if (err && err.errorCode === 404) {
        displaySasjsRunnerError(configJson.username)
      } else {
        const error: any = {}
        if (err.message) error.message = err.message
        if (err.error.message) error.message = err.error.message
        displayError(error, `An error occurred while executing the request.`)
      }
      await saveLogFile(sasjs, sasJobLocation, logFile, jobPath)
      result = err
    })

  return result
}

const saveLogFile = async (
  sasjs: SASjs,
  sasJobLocation: string,
  logFile: string | undefined,
  jobPath?: string | null
) => {
  const sasRequests: SASjsRequest[] = sasjs.getSasRequests()
  const currentRequestLog = sasRequests.find(
    (x) => x.serviceLink === sasJobLocation
  )

  if (currentRequestLog && jobPath) {
    if (!logFile) {
      const logPath = (await isSASjsProject())
        ? path.join(
            process.sasjsConstants.buildDestinationResultsFolder,
            'requests'
          )
        : process.projectDir
      const timestamp = generateTimestamp()
      const filename = sasJobLocation.split(path.sep).pop()
      logFile = path.join(logPath, `${filename}-${timestamp}.log`)
    }
    await saveLog(currentRequestLog.logFile, logFile, jobPath || '', false)
  }
}

/**
 * Writes output to the file
 * @param outputPathParam path to output file
 * @param output data to be written to output file
 * @param sasJobLocation is used for output file name when outputPathParam is undefined
 * @returns output path for the file created
 */
const writeOutput = async (
  outputPathParam: string | undefined,
  output: any,
  sasJobLocation: string
) => {
  let outputPath = (await isSASjsProject())
    ? path.join(
        process.sasjsConstants.buildDestinationResultsFolder,
        'requests'
      )
    : process.projectDir
  let outputFilename: string | undefined

  if (outputPathParam && typeof outputPathParam === 'string') {
    outputPathParam = path.join(process.projectDir, outputPathParam || '')

    let outputPathArr = outputPathParam.split(path.sep)
    outputFilename = outputPathArr.pop()
    outputPath = outputPathArr.join(path.sep)
  }

  if (!(await folderExists(outputPath))) {
    await createFolder(outputPath)
  }

  if (outputFilename) {
    outputPath += `${path.sep}${outputFilename}`
  } else {
    const timestamp = generateTimestamp()
    const filename = sasJobLocation.split(path.sep).pop()
    outputPath += `${path.sep}${filename}-${timestamp}.json`
  }

  let outputString = ''

  if (typeof output === 'object') {
    try {
      outputString = JSON.stringify(output, null, 2)
    } catch (error) {
      displayError(error, 'Result parsing failed.')
      return
    }
  } else {
    outputString = output
  }

  if (outputString) {
    await createFile(outputPath, outputString)

    displaySuccess(`Request finished. Output is stored at '${outputPath}'`)
  } else {
    displayError(
      `There was a problem with writing output file. Data not present.`
    )
  }
}
