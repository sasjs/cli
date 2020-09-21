import path from 'path'
import SASjs from '@sasjs/adapter/node'
import { findTargetInConfiguration } from '../utils/config-utils'
import {
  readFile,
  folderExists,
  createFile,
  createFolder
} from '../utils/file-utils'
import { getVariable } from '../utils/utils'
import { getAccessToken } from '../utils/auth-utils'
import { displayResult } from '../utils/displayResult'

export async function runSasJob(
  sasJobLocation,
  dataFilePath,
  configFilePath,
  targetName
) {
  const { target, isLocal } = await findTargetInConfiguration(targetName, true)
  if (!target) {
    throw new Error('Target not found! Please try again with another target.')
  }

  let dataJson
  let configJson

  if (dataFilePath !== 'default') {
    if (dataFilePath.split('.').slice(-1)[0] !== 'json') {
      throw new Error('Provided data file must be valid json.')
    }

    const dataFile = await readFile(path.join(process.cwd(), dataFilePath))

    try {
      dataJson = JSON.parse(dataFile)
    } catch (err) {
      throw new Error('Provided data file must be valid json.')
    }
  }

  if (configFilePath !== 'default') {
    if (configFilePath.split('.').slice(-1)[0] !== 'json') {
      throw new Error('Provided config file must be valid json.')
    }

    const configFile = await readFile(path.join(process.cwd(), configFilePath))

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

  const clientId = await getVariable('client', target)
  const clientSecret = await getVariable('secret', target)

  if (!clientId) {
    throw new Error(
      'A client ID is required for SAS Viya deployments.\n Please ensure that `client` is present in your build target configuration or in your .env file, and try again.\n'
    )
  }

  if (!clientSecret) {
    throw new Error(
      'A client secret is required for SAS Viya deployments.\n Please ensure that `secret` is present in your build target configuration or in your .env file, and try again.\n'
    )
  }

  const accessToken = await getAccessToken(
    sasjs,
    clientId,
    clientSecret,
    target,
    isLocal
  )

  let data = {
    fromjs: [dataJson]
  }

  if (!dataJson) data = null

  await sasjs
    .request(
      sasJobLocation,
      data,
      configJson,
      () => {
        displayResult(null, 'Login callback called. Request failed.', null)
      },
      accessToken
    )
    .then(
      async (res) => {
        let output

        try {
          output = JSON.stringify(res, null, 2)
        } catch (error) {
          displayResult(null, null, 'Request finished.')

          return
        }

        let outputPath = path.join(
          process.env.cwd(),
          isLocal ? '/sasjsbuild' : ''
        )

        if (!(await folderExists(outputPath))) {
          await createFolder(outputPath)
        }

        outputPath += '/output.json'

        await createFile(outputPath, output)

        displayResult(
          null,
          null,
          `Request finished. Output is stored at '${outputPath}'`
        )
      },
      (err) => {
        displayResult(
          err,
          'An error occurred while executing the request.',
          null
        )
      }
    )
}
