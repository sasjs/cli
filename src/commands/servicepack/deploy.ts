import path from 'path'
import SASjs from '@sasjs/adapter/node'
import { readFile } from '@sasjs/utils'
import { displayError, displaySuccess } from '../../utils/displayResult'
import { getAccessToken, findTargetInConfiguration } from '../../utils/config'
import { ServerType, Target } from '@sasjs/utils/types'
import { getAbsolutePath } from '../../utils/utils'

export async function servicePackDeploy(
  target: Target,
  jsonFilePath: string,
  isForced = false
) {
  if (path.extname(jsonFilePath) !== '.json') {
    throw new Error('Provided data file must be valid json.')
  }

  if (target.serverType !== ServerType.SasViya) {
    throw new Error(
      `Unable to deploy service pack to target ${target.name}. This command is only supported for server type ${ServerType.SasViya}.`
    )
  }

  process.logger?.info(
    `Deploying service pack to ${target.serverUrl} at location ${target.appLoc} .`
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
    allowInsecureRequests: buildTarget.allowInsecureRequests,
    appLoc: buildTarget.appLoc,
    serverType: buildTarget.serverType,
    useComputeApi: true
  })
  const { buildDestinationFolder } = process.sasjsConstants

  const finalFilePathJSON = path.join(
    buildDestinationFolder,
    `${buildTarget.name}.json`
  )

  let jsonContent

  if (jsonFilePath) {
    jsonContent = await readFile(getAbsolutePath(jsonFilePath, process.cwd()))
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
    throw new Error(
      `Deployment failed. Request is not authenticated.\nPlease add the following variables to your .env file:\nCLIENT, SECRET, ACCESS_TOKEN, REFRESH_TOKEN`
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
