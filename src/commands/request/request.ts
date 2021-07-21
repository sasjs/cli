import path from 'path'
import SASjs from '@sasjs/adapter/node'
import { findTargetInConfiguration, getAuthConfig } from '../../utils/config'
import {
  readFile,
  folderExists,
  createFile,
  createFolder,
  decodeFromBase64
} from '@sasjs/utils'
import { displayError, displaySuccess } from '../../utils/displayResult'
import { Command } from '../../utils/command'
import { ServerType } from '@sasjs/utils/types'
import { displaySasjsRunnerError, getAbsolutePath } from '../../utils/utils'
import { getConstants } from '../../constants'
import { config } from 'dotenv'

export async function runSasJob(command: Command) {
  const sasJobLocation = command.values.shift() as string
  const dataFilePath = command.getFlagValue('datafile') as string
  const configFilePath = command.getFlagValue('configfile') as string
  const targetName = command.getFlagValue('target') as string

  const { target, isLocal } = await findTargetInConfiguration(targetName)
  if (!target) {
    throw new Error('Target not found! Please try again with another target.')
  }

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
      const { sas9CredentialsError } = await getConstants()
      throw new Error(sas9CredentialsError)
    }
    configJson.password = decodeFromBase64(configJson.password)
  }

  const sasjs = new SASjs({
    serverUrl: target.serverUrl,
    allowInsecureRequests: target.allowInsecureRequests,
    appLoc: target.appLoc,
    serverType: target.serverType,
    contextName: target.contextName,
    useComputeApi: false
  })

  let authConfig
  if (target.serverType === ServerType.SasViya)
    authConfig = await getAuthConfig(target)

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
