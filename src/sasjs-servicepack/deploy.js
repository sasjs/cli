import path from 'path'
import SASjs from '@sasjs/adapter/node'
import chalk from 'chalk'
import {
  readFile,
  folderExists,
  createFile,
  createFolder
} from '../utils/file-utils'
import { displayResult } from '../utils/displayResult'
import {
  getAccessToken,
  findTargetInConfiguration
} from '../utils/config-utils'

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

  if (jsonFilePath.extname() !== 'json') {
    throw new Error('Provided data file must be valid json.')
  }

  const { target, isLocal } = await findTargetInConfiguration(targetName, true)

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

  let output = await deployToSasViyaWithServicePack(
    jsonFilePath,
    target,
    isForced
  )

  let outputPath = path.join(process.cwd(), isLocal ? '/sasjsbuild' : '')

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

  const CONSTANTS = require('../constants')
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
        `Deployment failed. Request is not authenticated.\nRun 'sasjs add' command and provide 'client' and 'secret'.`
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
