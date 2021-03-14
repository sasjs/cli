import { asyncForEach, chunk } from '../../utils/utils'
import {
  readFile,
  base64EncodeFile,
  base64EncodeImageFile,
  fileExists,
  folderExists,
  createFolder,
  createFile,
  deleteFolder,
  getFilesInFolder
} from '../../utils/file'
import { getLocalConfig } from '../../utils/config'
import path from 'path'
import jsdom, { JSDOM } from 'jsdom'
import { sasjsout } from './sasjsout'
import btoa from 'btoa'
import { ServerType, Target } from '@sasjs/utils'
import { getConstants } from '../../constants'
import { StreamConfig } from '@sasjs/utils/types/config'

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
  const { buildDestinationServicesFolder } = getConstants()

  const localConfig = await getLocalConfig()

  const streamConfig = { ...localConfig?.streamConfig, ...target.streamConfig }

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

  process.logger?.info(`Building web app services for target ${target.name}...`)
  await createBuildDestinationFolder()

  const destinationPath = path.join(
    buildDestinationServicesFolder,
    streamWebFolder
  )
  await createTargetDestinationFolder(destinationPath)

  const assetPathMap = await createAssetServices(target, destinationPath)
  const indexHtmlPath = path.isAbsolute(webSourcePath)
    ? path.join(webSourcePath, 'index.html')
    : path.join(process.projectDir, webSourcePath, 'index.html')

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
        assetPathMap
      )
    })
    const linkTags = getLinkTags(indexHtml)
    await asyncForEach(linkTags, async (linkTag) => {
      await updateLinkHref(linkTag, webSourcePath, destinationPath, target)
    })

    const faviconTags = getFaviconTags(indexHtml)

    await asyncForEach(faviconTags, async (faviconTag) => {
      await updateFaviconHref(faviconTag, webSourcePath)
    })

    await createClickMeService(
      indexHtml.serialize(),
      streamConfig.streamServiceName as string
    )
  }
}

async function createAssetServices(target: Target, destinationPath: string) {
  const { streamConfig } = target
  const { webSourcePath, streamWebFolder, assetPaths } = streamConfig!
  const assetPathMap: { source: string; target: string }[] = []
  await asyncForEach(assetPaths, async (assetPath) => {
    const pathExistsAsAbsoluteFolder = await folderExists(
      path.join(webSourcePath, assetPath)
    )
    const pathExistsInCurrentFolder = await folderExists(
      path.join(process.cwd(), webSourcePath, assetPath)
    )
    const pathExistsInParentFolder = await folderExists(
      path.join(process.cwd(), '..', webSourcePath, assetPath)
    )
    const fullAssetPath = pathExistsAsAbsoluteFolder
      ? path.join(webSourcePath, assetPath)
      : pathExistsInCurrentFolder
      ? path.join(process.cwd(), webSourcePath, assetPath)
      : pathExistsInParentFolder
      ? path.join(process.cwd(), '..', webSourcePath, assetPath)
      : ''
    const filePaths = await getFilesInFolder(fullAssetPath)
    await asyncForEach(filePaths, async (filePath) => {
      const fullFileName = path.basename(filePath)
      const fileName = fullFileName.substring(0, fullFileName.lastIndexOf('.'))
      const fileExtension = path
        .basename(filePath)
        .substring(fullFileName.lastIndexOf('.') + 1, fullFileName.length)
      if (fileName && fileExtension) {
        const base64string = await base64EncodeFile(
          path.join(fullAssetPath, filePath)
        )
        const fileName = await generateAssetService(
          base64string,
          filePath,
          destinationPath,
          target.serverType
        )
        const assetServiceUrl = getScriptPath(
          target.appLoc,
          target.serverType,
          streamWebFolder,
          fileName.replace('.sas', '')
        )
        assetPathMap.push({
          source: path.join(fullAssetPath, filePath),
          target: assetServiceUrl
        })
      }
    })
  })
  return assetPathMap
}

async function generateAssetService(
  content: string,
  filePath: string,
  destinationPath: string,
  serverType: ServerType
) {
  const fileType = path.extname(filePath).replace('.', '').toUpperCase()
  const fileName = path.basename(filePath).replace('.', '-')
  const serviceContent = await getWebServiceContent(
    content,
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
  assetPathMap: { source: string; target: string }[]
) {
  const scriptPath = tag.getAttribute('src')
  const isUrl =
    scriptPath && (scriptPath.startsWith('http') || scriptPath.startsWith('//'))

  if (scriptPath) {
    const fileName = `${path.basename(scriptPath).replace(/\./g, '')}`
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

      const serviceContent = await getWebServiceContent(
        content,
        'JS',
        target.serverType
      )

      await createFile(
        path.join(destinationPath, `${fileName}.sas`),
        serviceContent
      )

      tag.setAttribute(
        'src',
        getScriptPath(
          target.appLoc,
          target.serverType,
          target.streamConfig?.streamWebFolder!,
          fileName
        )
      )
    }
  }
}

async function updateLinkHref(
  linkTag: HTMLLinkElement,
  webAppSourcePath: string,
  destinationPath: string,
  target: Target
) {
  const linkSourcePath = linkTag.getAttribute('href') || ''
  const isUrl =
    linkSourcePath.startsWith('http') || linkSourcePath.startsWith('//')
  const fileName = `${path.basename(linkSourcePath).replace(/\./g, '')}`
  if (!isUrl) {
    const content = await readFile(
      path.join(process.projectDir, webAppSourcePath, linkSourcePath)
    )

    const serviceContent = await getWebServiceContent(
      content,
      'CSS',
      target.serverType
    )

    await createFile(
      path.join(destinationPath, `${fileName}.sas`),
      serviceContent
    )
    const linkHref = getLinkHref(
      target.appLoc,
      target.serverType,
      target.streamConfig?.streamWebFolder!,
      fileName
    )
    linkTag.setAttribute('href', linkHref)
  }
}

async function updateFaviconHref(
  linkTag: HTMLLinkElement,
  webAppSourcePath: string
) {
  const linkSourcePath = linkTag.getAttribute('href') || ''
  const isUrl =
    linkSourcePath.startsWith('http') || linkSourcePath.startsWith('//')
  if (!isUrl) {
    const base64string = await base64EncodeImageFile(
      path.isAbsolute(webAppSourcePath)
        ? path.join(webAppSourcePath, linkSourcePath)
        : path.join(process.projectDir, webAppSourcePath, linkSourcePath)
    )
    linkTag.setAttribute('href', base64string)
  }
}

function getScriptPath(
  appLoc: string,
  serverType: ServerType,
  streamWebFolder: string,
  fileName: string
) {
  if (!(serverType === ServerType.SasViya || serverType === ServerType.Sas9)) {
    throw new Error(
      'Unsupported server type. Supported types are SAS9 and SASVIYA'
    )
  }
  const storedProcessPath =
    // the appLoc is inserted dynamically by SAS
    serverType === ServerType.SasViya
      ? `/SASJobExecution?_PROGRAM=/services/${streamWebFolder}`
      : `/SASStoredProcess/?_PROGRAM=/services/${streamWebFolder}`
  return `${storedProcessPath}/${fileName}`
}

function getLinkHref(
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
      ? `/SASJobExecution?_PROGRAM=/services/${streamWebFolder}`
      : `/SASStoredProcess/?_PROGRAM=/services/${streamWebFolder}`
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
  const { buildDestinationFolder } = getConstants()
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

async function getWebServiceContent(
  content: string,
  type = 'JS',
  serverType: ServerType
) {
  let lines

  // Encode to base64 *.js and *.css files if target server type is SAS 9.
  const typesToEncode: { [key: string]: string } = {
    JS: 'JS64',
    CSS: 'CSS64'
  }

  if (serverType === ServerType.Sas9 && typesToEncode.hasOwnProperty(type)) {
    lines = [btoa(content)]
  } else {
    lines = content
      .replace(/\r\n/g, '\n')
      .split('\n')
      .filter((l) => !!l)
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
  const { buildDestinationServicesFolder } = getConstants()
  await createFile(
    path.join(buildDestinationServicesFolder, `${fileName}.sas`),
    clickMeServiceContent
  )
}
