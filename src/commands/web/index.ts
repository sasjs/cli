import { chunk } from '../../utils/utils'
import {
  readFile,
  copy,
  base64EncodeFile,
  base64EncodeImageFile,
  fileExists,
  folderExists,
  createFolder,
  createFile,
  deleteFolder,
  listFilesInFolder,
  ServerType,
  Target,
  asyncForEach,
  listSubFoldersInFolder
} from '@sasjs/utils'
import { getLocalConfig } from '../../utils/config'
import path from 'path'
import jsdom, { JSDOM } from 'jsdom'
import { sasjsout } from './sasjsout'
import { adjustIframeScript } from './adjustIframeScript'
import btoa from 'btoa'
import { getConstants } from '../../constants'
import { StreamConfig } from '@sasjs/utils/types/config'
import uniqBy from 'lodash.uniqby'

const permittedServerTypes = {
  SAS9: 'SAS9',
  SASVIYA: 'SASVIYA'
}

const exampleStreamConfig: StreamConfig = {
  streamWeb: true,
  streamWebFolder: '/example/folder/path',
  assetPaths: [],
  webSourcePath: '/example/path',
  streamServiceName: 'clickme'
}

export async function createWebAppServices(target: Target) {
  const { buildDestinationServicesFolder } = await getConstants()

  const localConfig = await getLocalConfig()

  const streamConfig = {
    ...localConfig?.streamConfig,
    ...target.streamConfig
  } as StreamConfig

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

  process.logger?.info(
    `Compiling web app services for target ${target.name}...`
  )
  await createBuildDestinationFolder()

  const destinationPath = path.join(
    buildDestinationServicesFolder,
    streamWebFolder
  )
  await createTargetDestinationFolder(destinationPath)

  const webSourcePathFull = path.isAbsolute(webSourcePath)
    ? webSourcePath
    : path.join(process.projectDir, webSourcePath)

  if (!(await folderExists(webSourcePathFull)))
    process.logger?.warn(
      `webSourcePath: '${webSourcePathFull}' present in 'streamConfig' doesn't exist.`
    )

  const assetPathMap = await createAssetServices(
    target,
    destinationPath,
    streamConfig
  )
  const indexHtmlPath = path.join(webSourcePathFull, 'index.html')

  if (await fileExists(indexHtmlPath)) {
    const indexHtml = await readFile(indexHtmlPath).then(
      (content) => new jsdom.JSDOM(content)
    )

    const scriptTags = getScriptTags(indexHtml)
    await asyncForEach(scriptTags, async (tag) => {
      await updateTagSource(
        tag,
        webSourcePath,
        destinationPath,
        target,
        streamConfig,
        assetPathMap
      )
    })

    const linkTags = getLinkTags(indexHtml)
    await asyncForEach(linkTags, async (linkTag) => {
      await updateLinkHref(
        linkTag,
        webSourcePath,
        destinationPath,
        target,
        streamConfig,
        assetPathMap
      )
    })

    const faviconTags = getFaviconTags(indexHtml)
    await asyncForEach(faviconTags, async (faviconTag) => {
      await updateFaviconHref(
        faviconTag,
        webSourcePath,
        destinationPath,
        target,
        streamConfig,
        assetPathMap
      )
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
}

async function createAssetServices(
  target: Target,
  destinationPath: string,
  streamConfig: StreamConfig
): Promise<{ source: string; target: string }[]> {
  const { webSourcePath, streamWebFolder, assetPaths } = streamConfig
  const assetPathMap: { source: string; target: string }[] = []

  await asyncForEach(
    [path.join(process.projectDir, webSourcePath), ...(assetPaths ?? [])],
    async (assetPath) => {
      const fullAssetPath = path.isAbsolute(assetPath)
        ? assetPath
        : path.isAbsolute(webSourcePath)
        ? path.join(webSourcePath, assetPath)
        : path.join(process.projectDir, webSourcePath, assetPath)
      const assetPathExists = await folderExists(fullAssetPath)

      if (!assetPathExists) {
        process.logger?.warn(
          `Assets path '${fullAssetPath}' present in 'streamConfig' doesn't exist.`
        )
        return
      }
      const assetPathMapNested = await createAssetsServicesNested(
        target,
        streamWebFolder,
        fullAssetPath,
        destinationPath
      )
      assetPathMap.push(...assetPathMapNested)
    }
  )
  return uniqBy(assetPathMap, 'source')
}

async function createAssetsServicesNested(
  target: Target,
  streamWebFolder: string,
  fullAssetPath: string,
  destinationPath: string
) {
  const assetPathMap: { source: string; target: string }[] = []
  const filePaths = await listFilesInFolder(fullAssetPath)
  await asyncForEach(filePaths, async (filePath) => {
    const fullFileName = path.basename(filePath)
    const fileName = fullFileName.substring(0, fullFileName.lastIndexOf('.'))
    const fileExtension = path
      .basename(filePath)
      .substring(fullFileName.lastIndexOf('.') + 1, fullFileName.length)
    if (fileName && fileExtension) {
      const sourcePath = path.join(fullAssetPath, filePath)
      if (target.serverType === ServerType.SasViya) {
        await copy(sourcePath, path.join(destinationPath, fullFileName))
        const assetServiceUrl = getAssetPath(
          target.appLoc,
          target.serverType,
          streamWebFolder,
          fullFileName
        )
        assetPathMap.push({
          source: fullFileName,
          target: assetServiceUrl
        })
      } else {
        const fileName = await generateAssetService(
          sourcePath,
          filePath,
          destinationPath,
          target.serverType
        )
        const assetServiceUrl = getAssetPath(
          target.appLoc,
          target.serverType,
          streamWebFolder,
          fileName.replace('.sas', '')
        )
        assetPathMap.push({
          source: fullFileName,
          target: assetServiceUrl
        })
      }
    }
  })

  const folderNames = await listSubFoldersInFolder(fullAssetPath)
  await asyncForEach(folderNames, async (folderName) => {
    const destinationPathNested = path.join(destinationPath, folderName)
    const fullAssetPathNested = path.join(fullAssetPath, folderName)

    await createFolder(destinationPathNested)

    const assetFolderMap: { source: string; target: string }[] =
      await createAssetsServicesNested(
        target,
        `${streamWebFolder}/${folderName}`,
        fullAssetPathNested,
        destinationPathNested
      )
    assetFolderMap.forEach((entry) => {
      assetPathMap.push({
        source: `${folderName}/${entry.source}`,
        target: entry.target
      })
    })
  })
  return assetPathMap
}

async function generateAssetService(
  sourcePath: string,
  filePath: string,
  destinationPath: string,
  serverType: ServerType
) {
  const nonBinaryFileTypes = ['HTML', 'CSS', 'JS']

  const fileType = path.extname(filePath).replace('.', '').toUpperCase()
  const fileName = path.basename(filePath).replace('.', '-')
  const base64string = nonBinaryFileTypes.includes(fileType)
    ? btoa(await readFile(sourcePath))
    : await base64EncodeFile(sourcePath)

  const serviceContent = await getWebServiceContentSAS9(
    base64string,
    fileType,
    serverType
  )

  await createFile(
    path.join(destinationPath, `${fileName}.sas`),
    serviceContent
  )

  return `${fileName}.sas`
}

async function updateTagSource(
  tag: HTMLLinkElement,
  webAppSourcePath: string,
  destinationPath: string,
  target: Target,
  streamConfig: StreamConfig,
  assetPathMap: { source: string; target: string }[]
) {
  const scriptPath = tag.getAttribute('src')
  const isUrl =
    scriptPath && (scriptPath.startsWith('http') || scriptPath.startsWith('//'))

  if (scriptPath) {
    if (!isUrl) {
      let content = await readFile(
        path.join(process.projectDir, webAppSourcePath, scriptPath)
      )

      assetPathMap.forEach((pathEntry) => {
        content = content.replace(
          new RegExp(pathEntry.source, 'g'),
          pathEntry.target
        )
      })

      if (target.serverType === ServerType.SasViya) {
        await createFile(path.join(destinationPath, scriptPath), content)
      } else {
        const serviceContent = await getWebServiceContentSAS9(
          btoa(content),
          'JS',
          target.serverType
        )
        await createFile(
          path.join(destinationPath, `${scriptPath.replace('.', '-')}.sas`),
          serviceContent
        )
      }

      tag.setAttribute(
        'src',
        assetPathMap.find(
          (entry) =>
            entry.source === scriptPath || `./${entry.source}` === scriptPath
        )!.target
      )
    }
  }
}

async function updateLinkHref(
  linkTag: HTMLLinkElement,
  webAppSourcePath: string,
  destinationPath: string,
  target: Target,
  streamConfig: StreamConfig,
  assetPathMap: { source: string; target: string }[]
) {
  const linkSourcePath = linkTag.getAttribute('href') || ''
  const isUrl =
    linkSourcePath.startsWith('http') || linkSourcePath.startsWith('//')
  if (!isUrl) {
    linkTag.setAttribute(
      'href',
      assetPathMap.find(
        (entry) =>
          entry.source === linkSourcePath ||
          `./${entry.source}` === linkSourcePath
      )!.target
    )
  }
}

async function updateFaviconHref(
  linkTag: HTMLLinkElement,
  webAppSourcePath: string,
  destinationPath: string,
  target: Target,
  streamConfig: StreamConfig,
  assetPathMap: { source: string; target: string }[]
) {
  const linkSourcePath = linkTag.getAttribute('href') || ''
  const isUrl =
    linkSourcePath.startsWith('http') || linkSourcePath.startsWith('//')
  if (!isUrl) {
    if (target.serverType === ServerType.SasViya) {
      linkTag.setAttribute(
        'href',
        assetPathMap.find(
          (entry) =>
            entry.source === linkSourcePath ||
            `./${entry.source}` === linkSourcePath
        )!.target
      )
    } else {
      const base64string = await base64EncodeImageFile(
        path.join(process.projectDir, webAppSourcePath, linkSourcePath)
      )
      linkTag.setAttribute('href', base64string)
    }
  }
}

function getAssetPath(
  appLoc: string,
  serverType: ServerType,
  streamWebFolder: string,
  fileName: string
) {
  if (!permittedServerTypes.hasOwnProperty(serverType.toUpperCase())) {
    throw new Error(
      'Unsupported server type. Supported types are SAS9 and SASVIYA'
    )
  }
  const storedProcessPath =
    // the appLoc is inserted dynamically by SAS
    serverType === ServerType.SasViya
      ? `/SASJobExecution?_FILE=${appLoc}/services/${streamWebFolder}`
      : `/SASStoredProcess/?_PROGRAM=${appLoc}/services/${streamWebFolder}`
  return `${storedProcessPath}/${fileName}`
}

function getScriptTags(parsedHtml: JSDOM) {
  return Array.from(parsedHtml.window.document.querySelectorAll('script'))
}

function getLinkTags(parsedHtml: JSDOM) {
  const linkTags = Array.from(
    parsedHtml.window.document.querySelectorAll('link')
  ).filter((s) => s.getAttribute('rel') === 'stylesheet')

  return linkTags
}

function getFaviconTags(parsedHtml: JSDOM) {
  const linkTags = Array.from(
    parsedHtml.window.document.querySelectorAll('link')
  ).filter(
    (s) =>
      s.getAttribute('rel') &&
      s.getAttribute('rel') &&
      s.getAttribute('rel')!.includes('icon')
  )

  return linkTags
}

async function createBuildDestinationFolder() {
  const { buildDestinationFolder } = await getConstants()
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

async function getWebServiceContentSAS9(
  contentBase64: string,
  type = 'JS',
  serverType: ServerType
) {
  let lines = [contentBase64]

  // Encode to base64 *.js and *.css files if target server type is SAS 9.
  const typesToEncode: { [key: string]: string } = {
    JS: 'JS64',
    CSS: 'CSS64'
  }

  let serviceContent = `${sasjsout}\nfilename sasjs temp lrecl=99999999;
data _null_;
file sasjs;
`

  lines.forEach((line) => {
    const chunkedLines = chunk(line)
    if (chunkedLines.length === 1) {
      serviceContent += `put '${chunkedLines[0].split("'").join("''")}';\n`
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
      serviceContent += combinedLines
    }
  })

  if (
    serverType === permittedServerTypes.SAS9 &&
    typesToEncode.hasOwnProperty(type)
  ) {
    serviceContent += `\nrun;\n%sasjsout(${typesToEncode[type]})`
  } else {
    serviceContent += `\nrun;\n%sasjsout(${type})`
  }

  return serviceContent
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
  const { buildDestinationServicesFolder } = await getConstants()
  await createFile(
    path.join(buildDestinationServicesFolder, `${fileName}.sas`),
    clickMeServiceContent
  )
}

async function createClickMeFile(indexHtmlContent: string, fileName: string) {
  const { buildDestinationServicesFolder } = await getConstants()
  await createFile(
    path.join(buildDestinationServicesFolder, `${fileName}.html`),
    indexHtmlContent
  )
}
