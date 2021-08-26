import path from 'path'
import { displayError, displaySuccess } from '../../utils/displayResult'
import { Target } from '@sasjs/utils'
import { getAbsolutePath } from '../../utils/utils'
import { deployToSasViyaWithServicePack } from '../shared/deployToSasViyaWithServicePack'

export async function servicePackDeploy(
  target: Target,
  jsonFilePath: string,
  isForced = false
) {
  if (path.extname(jsonFilePath) !== '.json') {
    throw new Error('Provided data file must be valid json.')
  }

  process.logger?.info(
    `Deploying service pack to ${target.serverUrl} at location ${target.appLoc} .`
  )

  if (jsonFilePath) {
    jsonFilePath = getAbsolutePath(jsonFilePath, process.cwd())
  } else {
    const { buildDestinationFolder } = process.sasjsConstants
    jsonFilePath = path.join(buildDestinationFolder, `${target.name}.json`)
  }

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
