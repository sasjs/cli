import path from 'path'
import SASjs from '@sasjs/adapter/node'
import { findTargetInConfiguration } from '../utils/config-utils'
import { readFile, folderExists, createFile, createFolder } from '../utils/file'
import { getAccessToken } from '../utils/config-utils'
import { displayError, displaySuccess } from '../utils/displayResult'

export async function runSasJob(command) {
  const sasJobLocation = command.values.shift()
  const dataFilePath = command.getFlagValue('datafile')
  const configFilePath = command.getFlagValue('configfile')
  const targetName = command.getFlagValue('target')

  const { target, isLocal } = await findTargetInConfiguration(targetName, true)
  if (!target) {
    throw new Error('Target not found! Please try again with another target.')
  }

  let dataJson
  let configJson

  if (dataFilePath) {
    if (dataFilePath.split('.').slice(-1)[0] !== 'json') {
      throw new Error('Provided data file must be valid json.')
    }

    const dataFile = await readFile(path.join(process.projectDir, dataFilePath))

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
      path.join(process.projectDir, configFilePath)
    )

    try {
      configJson = JSON.parse(configFile)
    } catch (err) {
      throw new Error('Provided config file must be valid json.')
    }
  }

  const sasjs = new SASjs({
    serverUrl: target.serverUrl,
    appLoc: target.appLoc,
    serverType: target.serverType
  })

  const accessToken = await getAccessToken(target)

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
      accessToken
    )
    .then(
      async (res) => {
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
      },
      (err) => {
        result = err

        displayError(err, 'An error occurred while executing the request.')
      }
    )
  return result
}
