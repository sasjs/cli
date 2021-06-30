import path from 'path'
import SASjs from '@sasjs/adapter/node'
import { findTargetInConfiguration, getAuthConfig } from '../../utils/config'
import { readFile, folderExists, createFile, createFolder } from '@sasjs/utils'
import { displayError, displaySuccess } from '../../utils/displayResult'
import { Command } from '../../utils/command'
import { ServerType } from '@sasjs/utils/types'
import { displaySasjsRunnerError } from '../../utils/utils'

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
      path.isAbsolute(dataFilePath)
        ? dataFilePath
        : path.join(process.projectDir, dataFilePath)
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
      path.isAbsolute(configFilePath)
        ? configFilePath
        : path.join(process.projectDir, configFilePath)
    )

    try {
      configJson = JSON.parse(configFile)
    } catch (err) {
      throw new Error('Provided config file must be valid json.')
    }
  }

  if (target.serverType === ServerType.Sas9) {
    configJson.username = process.env.SAS_USERNAME
    configJson.password = process.env.SAS_PASSWORD
    if (!configJson.username || !configJson.password) {
      throw new Error(
        'A valid username and password are required for requests to SAS9 servers.' +
          '\nPlease set the SAS_USERNAME and SAS_PASSWORD variables in your target-specific or project-level .env file.'
      )
    }
  }

  const sasjs = new SASjs({
    serverUrl: target.serverUrl,
    allowInsecureRequests: target.allowInsecureRequests,
    appLoc: target.appLoc,
    serverType: target.serverType,
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
