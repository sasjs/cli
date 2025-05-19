import {
  readFile,
  fileExists,
  folderExists,
  createFolder,
  copy,
  deleteFolder,
  ServerType,
  Target,
  getAbsolutePath
} from '@sasjs/utils'
import { getStreamConfig } from '../../utils/config'
import path from 'path'
import jsdom from 'jsdom'
import { StreamConfig } from '@sasjs/utils/types/config'
import { createAssetServices } from './internal/createAssetServices'
import { updateAllTags } from './internal/updateAllTags'
import { createClickMeService } from './internal/sas9'
import { createClickMeFile } from './internal/sasViya'

const exampleStreamConfig: StreamConfig = {
  streamWeb: true,
  streamWebFolder: '/example/folder/path',
  assetPaths: [],
  webSourcePath: '/example/path',
  streamServiceName: 'clickme'
}

export async function createWebAppServices(target: Target) {
  const { buildDestinationServicesFolder } = process.sasjsConstants

  const streamConfig = await getStreamConfig(target)

  const { webSourcePathFull, indexHtmlPath } = await validateStreamConfig(
    streamConfig
  )

  await createBuildDestinationFolder()

  const destinationPath = path.join(
    buildDestinationServicesFolder,
    streamConfig.streamWebFolder
  )
  await createTargetDestinationFolder(destinationPath)

  // For server type SASjs, just need to copy webSourcePath
  // to streamWebFolder, no need to create service files.
  if (target.serverType === ServerType.Sasjs) {
    process.logger?.info(`Copying web app files for target ${target.name}...`)
    await copy(webSourcePathFull, destinationPath)
    return
  }
  process.logger?.info(
    `Compiling web app services for target ${target.name}...`
  )

  const assetPathMap = await createAssetServices(
    target,
    destinationPath,
    streamConfig
  ).then((map) => {
    const indexHtmlIndex = map.findIndex(
      (assetPath) => assetPath.source === 'index.html'
    )
    map.splice(indexHtmlIndex, 1)
    return map
  })

  const indexHtml = await readFile(indexHtmlPath).then(
    (content) => new jsdom.JSDOM(content)
  )

  await updateAllTags(indexHtml, target, {
    webSourcePathFull,
    destinationPath,
    serverType: target.serverType,
    assetPathMap
  })

  switch (target.serverType) {
    case ServerType.SasViya:
      await createClickMeFile(
        indexHtml.serialize(),
        streamConfig.streamServiceName as string
      )

      break

    case ServerType.Sas9:
      await createClickMeService(
        indexHtml.serialize(),
        streamConfig.streamServiceName as string
      )

      break

    default:
      throw new Error(
        `Server Type: ${target.serverType} is not supported for processing streaming index file.`
      )
  }
}

const validateStreamConfig = async (streamConfig: StreamConfig) => {
  if (!streamConfig) {
    throw new Error(
      `Invalid stream config: Please specify the \`streamConfig\` in your target in the following format: \n ${JSON.stringify(
        exampleStreamConfig,
        null,
        2
      )}`
    )
  }

  const { webSourcePath, streamWebFolder } = streamConfig
  if (!webSourcePath) {
    throw new Error(
      `Invalid web sourcePath: Please specify the \`streamConfig\` in your target in the following format: \n ${JSON.stringify(
        exampleStreamConfig,
        null,
        2
      )}`
    )
  }

  if (!streamWebFolder) {
    throw new Error(
      `Invalid stream web folder: Please specify the \`streamConfig\` in your target in the following format: \n ${JSON.stringify(
        exampleStreamConfig,
        null,
        2
      )}`
    )
  }

  const webSourcePathFull = getAbsolutePath(
    streamConfig.webSourcePath,
    process.projectDir
  )

  if (!(await folderExists(webSourcePathFull))) {
    throw new Error(
      `webSourcePath: '${webSourcePathFull}' present in 'streamConfig' doesn't exist.`
    )
  }

  const indexHtmlPath = path.join(webSourcePathFull, 'index.html')

  if (!(await fileExists(indexHtmlPath))) {
    throw new Error(
      `'index.html' doesn't exist at webSourcePath: '${webSourcePathFull}' present in 'streamConfig'`
    )
  }

  return { webSourcePathFull, indexHtmlPath }
}

async function createBuildDestinationFolder() {
  const { buildDestinationFolder } = process.sasjsConstants
  const pathExists = await fileExists(buildDestinationFolder)
  if (!pathExists) {
    await createFolder(buildDestinationFolder)
  }
}

async function createTargetDestinationFolder(destinationPath: string) {
  const pathExists = await fileExists(destinationPath)
  if (pathExists) {
    await deleteFolder(destinationPath)
  }
  await createFolder(destinationPath)
}
