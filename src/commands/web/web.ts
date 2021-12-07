import {
  readFile,
  fileExists,
  folderExists,
  createFolder,
  createFile,
  deleteFolder,
  ServerType,
  Target,
  chunk,
  getAbsolutePath
} from '@sasjs/utils'
import { getStreamConfig } from '../../utils/config'
import path from 'path'
import jsdom from 'jsdom'
import { sasjsout } from './internal/sasjsout'
import { adjustIframeScript } from './internal/adjustIframeScript'
import { StreamConfig } from '@sasjs/utils/types/config'
import { createAssetServices } from './internal/createAssetServices'
import { updateAllTags } from './internal/updateAllTags'

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

  process.logger?.info(
    `Compiling web app services for target ${target.name}...`
  )
  await createBuildDestinationFolder()

  const destinationPath = path.join(
    buildDestinationServicesFolder,
    streamConfig.streamWebFolder
  )
  await createTargetDestinationFolder(destinationPath)

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

  await updateAllTags(indexHtml, {
    webSourcePathFull,
    destinationPath,
    serverType: target.serverType,
    assetPathMap
  })

  if (target.serverType === ServerType.SasViya) {
    indexHtml.window.document.body.innerHTML += adjustIframeScript
    await createClickMeFile(
      indexHtml.serialize(),
      streamConfig.streamServiceName as string
    )
  } else
    await createClickMeService(
      indexHtml.serialize(),
      streamConfig.streamServiceName as string
    )
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

async function createClickMeService(
  indexHtmlContent: string,
  fileName: string
) {
  const lines = indexHtmlContent.replace(/\r\n/g, '\n').split('\n')
  let clickMeServiceContent = `${sasjsout}\nfilename sasjs temp lrecl=99999999;\ndata _null_;\nfile sasjs;\n`

  lines.forEach((line) => {
    const chunkedLines = chunk(line)
    if (chunkedLines.length === 1) {
      if (chunkedLines[0].length == 0) chunkedLines[0] = ' '

      clickMeServiceContent += `put '${chunkedLines[0]
        .split("'")
        .join("''")}';\n`
    } else {
      let combinedLines = ''
      chunkedLines.forEach((chunkedLine, index) => {
        let text = `put '${chunkedLine.split("'").join("''")}'`
        if (index !== chunkedLines.length - 1) {
          text += '@;\n'
        } else {
          text += ';\n'
        }
        combinedLines += text
      })
      clickMeServiceContent += combinedLines
    }
  })
  clickMeServiceContent += 'run;\n%sasjsout(HTML)'
  const { buildDestinationServicesFolder } = process.sasjsConstants
  await createFile(
    path.join(buildDestinationServicesFolder, `${fileName}.sas`),
    clickMeServiceContent
  )
}

async function createClickMeFile(indexHtmlContent: string, fileName: string) {
  const { buildDestinationServicesFolder } = process.sasjsConstants
  await createFile(
    path.join(buildDestinationServicesFolder, `${fileName}.html`),
    indexHtmlContent
  )
}
