import path from 'path'
import SASjs from '@sasjs/adapter/node'
import {
  readFile,
  folderExists,
  createFile,
  createFolder,
  decodeFromBase64,
  getAbsolutePath
} from '@sasjs/utils'
import { displayError, displaySuccess } from '../../utils/displayResult'
import { AuthConfig, ServerType, Target } from '@sasjs/utils/types'
import { displaySasjsRunnerError } from '../../utils/utils'

export async function runSasJob(
  target: Target,
  isLocal: boolean,
  sasJobLocation: string,
  dataFilePath?: string,
  configFilePath?: string,
  authConfig?: AuthConfig
) {
  let dataJson: any = {}
  let configJson: any = {}

  if (dataFilePath) {
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
    useComputeApi: false
  })

  if (!dataJson) dataJson = null

  let result
  await sasjs
    .request(
      sasJobLocation,
      dataJson,
      configJson,
      () => {
        displayError(null, 'Login callback called. Request failed.')
      },
      authConfig
    )
    .then(async (res) => {
      if (res?.result) res = res.result

      let output

      try {
        output = JSON.stringify(res, null, 2)
      } catch (error) {
        displayError(error, 'Result parsing failed.')

        return error
      }

      let outputPath = path.join(
        process.projectDir,
        isLocal ? '/sasjsbuild' : ''
      )

      if (!(await folderExists(outputPath))) {
        await createFolder(outputPath)
      }

      outputPath += '/output.json'

      await createFile(outputPath, output)
      result = true
      displaySuccess(`Request finished. Output is stored at '${outputPath}'`)
    })
    .catch((err) => {
      result = err

      if (err && err.errorCode === 404) {
        displaySasjsRunnerError(configJson.username)
      } else {
        displayError(err, 'An error occurred while executing the request.')
      }
    })
  return result
}
