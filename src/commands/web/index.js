import { findTargetInConfiguration } from '../../utils/config-utils'
import { asyncForEach, chunk } from '../../utils/utils'
import {
  readFile,
  base64EncodeFile,
  fileExists,
  folderExists,
  createFolder,
  createFile,
  deleteFolder,
  getFilesInFolder
} from '../../utils/file-utils'
import path from 'path'
import chalk from 'chalk'
import jsdom from 'jsdom'
import base64img from 'base64-img'
import { sasjsout } from './sasjsout'
import btoa from 'btoa'
import { Command } from '../../utils/command'

let buildDestinationFolder = ''
const permittedServerTypes = {
  SAS9: 'SAS9',
  SASVIYA: 'SASVIYA'
}

export async function createWebAppServices(
  commandLine = null,
  preTargetToBuild = null
) {
  const command = new Command(commandLine)

  let targetName = command.getFlagValue('target')
  targetName = targetName ? targetName : null

  const CONSTANTS = require('../../constants')
  buildDestinationFolder = CONSTANTS.buildDestinationFolder

  console.log(chalk.greenBright('Building web app services...'))

  await createBuildDestinationFolder()

  let targetToBuild = null

  if (preTargetToBuild) targetToBuild = preTargetToBuild
  else {
    const { target } = await findTargetInConfiguration(targetName)
    targetToBuild = target
  }

  if (targetToBuild) {
    console.log(
      chalk.greenBright(
        `Building for target ${chalk.cyanBright(targetToBuild.name)}`
      )
    )

    const webAppSourcePath = targetToBuild.webSourcePath
    const destinationPath = path.join(
      buildDestinationFolder,
      'services',
      targetToBuild.streamWebFolder
    )
    await createTargetDestinationFolder(destinationPath)

    if (webAppSourcePath) {
      const assetPathMap = await createAssetServices(
        targetToBuild,
        destinationPath
      )
      const hasIndexHtml = await fileExists(
        path.join(process.projectDir, webAppSourcePath, 'index.html')
      )
      if (hasIndexHtml) {
        const indexHtml = await readFile(
          path.join(process.projectDir, webAppSourcePath, 'index.html')
        ).then((content) => new jsdom.JSDOM(content))

        const scriptTags = getScriptTags(indexHtml)
        await asyncForEach(scriptTags, async (tag) => {
          await updateTagSource(
            tag,
            webAppSourcePath,
            destinationPath,
            targetToBuild,
            assetPathMap
          )
        })
        const linkTags = getLinkTags(indexHtml)
        await asyncForEach(linkTags, async (linkTag) => {
          await updateLinkHref(
            linkTag,
            webAppSourcePath,
            destinationPath,
            targetToBuild
          )
        })

        const faviconTags = getFaviconTags(indexHtml)

        await asyncForEach(faviconTags, async (faviconTag) => {
          await updateFaviconHref(
            faviconTag,
            webAppSourcePath,
            destinationPath,
            targetToBuild
          )
        })

        await createClickMeService(indexHtml.serialize())
      }
    } else {
      throw new Error(
        'webSourcePath has not been specified. Please check your config and try again.'
      )
    }
  } else
    throw new Error(
      'no target is found. Please check your config and try again.'
    )
}

async function createAssetServices(target, destinationPath) {
  const assetPaths = target.assetPaths || []
  const assetPathMap = []
  await asyncForEach(assetPaths, async (assetPath) => {
    const pathExistsInCurrentFolder = await folderExists(
      path.join(process.cwd(), target.webSourcePath, assetPath)
    )
    const pathExistsInParentFolder = await folderExists(
      path.join(process.cwd(), '..', target.webSourcePath, assetPath)
    )
    const fullAssetPath = pathExistsInCurrentFolder
      ? path.join(process.cwd(), target.webSourcePath, assetPath)
      : pathExistsInParentFolder
      ? path.join(process.cwd(), '..', target.webSourcePath, assetPath)
      : null
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
          destinationPath
        )
        const assetServiceUrl = getScriptPath(
          target.appLoc,
          target.serverType,
          target.streamWebFolder,
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

async function generateAssetService(content, filePath, destinationPath) {
  const fileType = path.extname(filePath).replace('.', '').toUpperCase()
  const fileName = path.basename(filePath).replace('.', '-')
  const serviceContent = await getWebServiceContent(content, fileType)

  await createFile(
    path.join(destinationPath, `${fileName}.sas`),
    serviceContent
  )

  return `${fileName}.sas`
}

async function updateTagSource(
  tag,
  webAppSourcePath,
  destinationPath,
  target,
  assetPathMap
) {
  const scriptPath = tag.getAttribute('src')
  const isUrl =
    scriptPath && (scriptPath.startsWith('http') || scriptPath.startsWith('//'))

  if (scriptPath) {
    const fileName = `${path.basename(scriptPath).replace(/\./g, '')}`
    if (!isUrl) {
      const content = await readFile(
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
          target.streamWebFolder,
          fileName
        )
      )
    }
  }
}

async function updateLinkHref(
  linkTag,
  webAppSourcePath,
  destinationPath,
  target
) {
  const linkSourcePath = linkTag.getAttribute('href')
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
      target.streamWebFolder,
      fileName
    )
    linkTag.setAttribute('href', linkHref)
  }
}

async function updateFaviconHref(linkTag, webAppSourcePath) {
  const linkSourcePath = linkTag.getAttribute('href')
  const isUrl =
    linkSourcePath.startsWith('http') || linkSourcePath.startsWith('//')
  if (!isUrl) {
    const base64string = base64img.base64Sync(
      path.join(process.projectDir, webAppSourcePath, linkSourcePath)
    )
    linkTag.setAttribute('href', base64string)
  }
}

function getScriptPath(appLoc, serverType, streamWebFolder, fileName) {
  if (!permittedServerTypes.hasOwnProperty(serverType.toUpperCase())) {
    throw new Error(
      'Unsupported server type. Supported types are SAS9 and SASVIYA'
    )
  }
  const storedProcessPath =
    serverType === 'SASVIYA'
      ? `/SASJobExecution?_PROGRAM=${appLoc}/${streamWebFolder}`
      : `/SASStoredProcess/?_PROGRAM=${appLoc}/${streamWebFolder}`
  return `${storedProcessPath}/${fileName}`
}

function getLinkHref(appLoc, serverType, streamWebFolder, fileName) {
  if (!permittedServerTypes.hasOwnProperty(serverType.toUpperCase())) {
    throw new Error(
      'Unsupported server type. Supported types are SAS9 and SASVIYA'
    )
  }
  const storedProcessPath =
    serverType === 'SASVIYA'
      ? `/SASJobExecution?_PROGRAM=${appLoc}/${streamWebFolder}`
      : `/SASStoredProcess/?_PROGRAM=${appLoc}/${streamWebFolder}`
  return `${storedProcessPath}/${fileName}`
}

function getScriptTags(parsedHtml) {
  return parsedHtml.window.document.querySelectorAll('script')
}

function getLinkTags(parsedHtml) {
  const linkTags = Array.from(
    parsedHtml.window.document.querySelectorAll('link')
  ).filter((s) => s.getAttribute('rel') === 'stylesheet')

  return linkTags
}

function getFaviconTags(parsedHtml) {
  const linkTags = Array.from(
    parsedHtml.window.document.querySelectorAll('link')
  ).filter(
    (s) => s.getAttribute('rel') && s.getAttribute('rel').includes('icon')
  )

  return linkTags
}

async function createBuildDestinationFolder() {
  const pathExists = await fileExists(buildDestinationFolder)
  if (!pathExists) {
    await createFolder(buildDestinationFolder)
  }
}

async function createTargetDestinationFolder(destinationPath) {
  const pathExists = await fileExists(destinationPath)
  if (pathExists) {
    await deleteFolder(destinationPath)
  }
  await createFolder(destinationPath)
}

async function getWebServiceContent(content, type = 'JS', serverType) {
  let lines

  // Encode to base64 *.js and *.css files if target server type is SAS 9.
  const typesToEncode = {
    JS: 'JS64',
    CSS: 'CSS64'
  }

  if (
    serverType === permittedServerTypes.SAS9 &&
    typesToEncode.hasOwnProperty(type)
  ) {
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

async function createClickMeService(indexHtmlContent) {
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
  await createFile(
    path.join(buildDestinationFolder, 'services', 'clickme.sas'),
    clickMeServiceContent
  )
}
