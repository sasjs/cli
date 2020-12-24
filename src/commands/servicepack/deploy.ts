import path from 'path'
import SASjs from '@sasjs/adapter/node'
import chalk from 'chalk'
import { readFile } from '../../utils/file'
import { displayError, displaySuccess } from '../../utils/displayResult'
import {
  getAccessToken,
  findTargetInConfiguration
} from '../../utils/config-utils'
import { ServerType, Target } from '@sasjs/utils/types'
import { getConstants } from '../../constants'

export async function servicePackDeploy(
  jsonFilePath: string,
  targetName: string,
  isForced = false
) {
  if (path.extname(jsonFilePath) !== '.json') {
    throw new Error('Provided data file must be valid json.')
  }

  const { target } = await findTargetInConfiguration(targetName, true)

  if (target.serverType !== ServerType.SasViya) {
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
      displaySuccess('Servicepack successfully deployed!')

      success = true
    })
    .catch((err) => {
      displayError(err, 'Servicepack deploy failed.')

      success = false
    })

  return success
}

async function deployToSasViyaWithServicePack(
  jsonFilePath: string,
  buildTarget: Target,
  isForced: boolean
) {
  const sasjs = new SASjs({
    serverUrl: buildTarget.serverUrl,
    appLoc: buildTarget.appLoc,
    serverType: buildTarget.serverType
  })
  const { buildDestinationFolder } = getConstants()

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
    undefined,
    undefined,
    access_token,
    isForced
  )
}
