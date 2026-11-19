import {
  readFile,
  fileExists,
  folderExists,
  createFolder,
  createFile,
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
import { createClickMeFile } from './internal/createClickMeFile'
import { getAssetPrefix } from './internal/getAssetPath'

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

  const { webSourcePathFull, indexHtmlPath } =
    await validateStreamConfig(streamConfig)

  await createBuildDestinationFolder()

  const destinationPath = path.join(
    buildDestinationServicesFolder,
    streamConfig.streamWebFolder
  )
  await createTargetDestinationFolder(destinationPath)

  // Every server type that streams builds the same artefact: the assets are
  // copied into the deployment folder and the entry page's links are rewritten
  // to the route that reads one back. What differs is the route - see
  // getAssetPath - and, for SAS 9, that an asset is a stored process rather
  // than a file. A SASjs server target used to skip all of this and copy the
  // frontend as-is, which is why a Viya build could not be opened on it.
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

  const assetPrefix = getAssetPrefix(
    target.appLoc,
    target.serverType,
    streamConfig.streamWebFolder
  )

  await updateAllTags(indexHtml, target, {
    webSourcePathFull,
    destinationPath,
    serverType: target.serverType,
    assetPathMap,
    assetPrefix
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

    // SASjs server reads a Drive file by name, so its entry page is the same
    // file everywhere else's is: `<services>/<name>.html`, one level above the
    // folder holding the assets
    case ServerType.Sasjs:
      await createClickMeFile(
        indexHtml.serialize(),
        streamConfig.streamServiceName as string
      )

      break

    default:
      throw new Error(
        `Server Type: ${target.serverType} is not supported for processing streaming index file.`
      )
  }

  // The folder holding the assets is itself served as a web app - an app stream
  // on SASjs server, and whatever a web server is pointed at elsewhere - and the
  // entry page the frontend was built with sits in it. Left as the frontend
  // wrote it, that copy names the appLoc the frontend was compiled against, so a
  // deployment to any other appLoc talks to a different one. Writing the
  // rewritten entry there makes every copy of the frontend resolve to this
  // target's appLoc, through the route the entry page above already uses.
  if (
    target.serverType === ServerType.SasViya ||
    target.serverType === ServerType.Sasjs
  ) {
    await createFile(
      path.join(destinationPath, 'index.html'),
      indexHtml.serialize()
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
