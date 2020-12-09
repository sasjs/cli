import path from 'path'
import SASjs from '@sasjs/adapter/node'
import chalk from 'chalk'
import { readFile } from '../../utils/file'
import { displayResult } from '../../utils/displayResult'
import {
  getAccessToken,
  findTargetInConfiguration
} from '../../utils/config-utils'

export async function servicePackDeploy(
  jsonFilePath = null,
  targetName = null,
  isForced = false
) {
  console.log({
    jsonFilePath,
    targetName,
    isForced
  })

  if (path.extname(jsonFilePath) !== '.json') {
    throw new Error('Provided data file must be valid json.')
  }

  const { target } = await findTargetInConfiguration(targetName, true)

  if (!target.serverType === 'SASVIYA') {
    console.log(
      chalk.redBright.bold(
        `Deployment failed. This commmand is only available on VIYA servers.`
      )
    )

    return
  }

  console.log(
    chalk.cyanBright(`Executing deployServicePack to update SAS server.`)
  )

  let success

  await deployToSasViyaWithServicePack(jsonFilePath, target, isForced)
    .then((_) => {
      displayResult(null, null, 'Servicepack successfully deployed!')

      success = true
    })
    .catch((err) => {
      displayResult(err, 'Servicepack deploy failed.')

      success = false
    })

  return success
}

async function deployToSasViyaWithServicePack(
  jsonFilePath,
  buildTarget,
  isForced
) {
  const sasjs = new SASjs({
    serverUrl: buildTarget.serverUrl,
    appLoc: buildTarget.appLoc,
    serverType: buildTarget.serverType
  })

  const CONSTANTS = require('../../constants').get()
  const buildDestinationFolder = CONSTANTS.buildDestinationFolder

  const finalFilePathJSON = path.join(
    buildDestinationFolder,
    `${buildTarget.name}.json`
  )

  let jsonContent

  if (jsonFilePath) {
    jsonContent = await readFile(path.join(process.cwd(), jsonFilePath))
  } else {
    jsonContent = await readFile(finalFilePathJSON)
  }

  let jsonObject

  try {
    jsonObject = JSON.parse(jsonContent)
  } catch (err) {
    throw new Error('Provided data file must be valid json.')
  }

  const access_token = await getAccessToken(buildTarget)

  if (!access_token) {
    console.log(
      chalk.redBright.bold(
        `Deployment failed. Request is not authenticated.\nPlease add the following variables to your .env file:\nCLIENT, SECRET, ACCESS_TOKEN, REFRESH_TOKEN`
      )
    )
  }

  return await sasjs.deployServicePack(
    jsonObject,
    null,
    null,
    access_token,
    isForced
  )
}
