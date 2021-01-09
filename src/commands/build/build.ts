import path from 'path'
import { Target, ServerType } from '@sasjs/utils/types'
import { createWebAppServices } from '../web'
import {
  readFile,
  getSubFoldersInFolder,
  getFilesInFolder,
  createFile
} from '../../utils/file'
import { asyncForEach, removeComments, chunk } from '../../utils/utils'
import {
  getConfiguration,
  findTargetInConfiguration,
  getMacroCorePath
} from '../../utils/config'
import { compile } from '../compile/compile'
import { getConstants } from '../../constants'
import { getBuildInit, getBuildTerm } from './internal/config'
import { getDependencyPaths } from '../shared/dependencies'

export async function build(targetName: string) {
  const { target } = await findTargetInConfiguration(targetName)

  await compile(targetName)

  await createFinalSasFiles(target)
}

async function createFinalSasFiles(target: Target) {
  process.logger?.info('Creating output SAS and JSON files.')

  const { streamConfig } = target
  const streamWeb = streamConfig?.streamWeb ?? false
  if (streamWeb) {
    process.logger?.info(
      'Building web app services since `streamWeb` is enabled.'
    )
    await createWebAppServices(target.name)
      .then(() => process.logger?.success(`Web app services have been built.`))
      .catch((err) => {
        process.logger?.error(
          'An error has occurred when building web app services.'
        )
        throw err
      })
  }

  await createFinalSasFile(target)
}

async function createFinalSasFile(target: Target) {
  const { buildConfig, serverType, macroFolders, name } = target
  const buildOutputFileName = buildConfig?.buildOutputFileName ?? `${name}.sas`

  const { buildDestinationFolder } = getConstants()

  let finalSasFileContent = ''
  const finalFilePath = path.join(buildDestinationFolder, buildOutputFileName)
  const finalFilePathJSON = path.join(buildDestinationFolder, `${name}.json`)
  const buildInfo = await getBuildInfo(target).catch((_) => {})

  finalSasFileContent += `\n${buildInfo}`

  const buildInit = await getBuildInit(target)
  const buildTerm = await getBuildTerm(target)

  const dependencyFilePaths = await getDependencyPaths(
    `${buildTerm}\n${buildInit}`,
    macroFolders
  )
  const dependenciesContent = await getDependencies(dependencyFilePaths)

  finalSasFileContent += `\n${dependenciesContent}\n\n${buildInit}\n`

  const { folderContent, folderContentJSON } = await getFolderContent(
    serverType
  )
  finalSasFileContent += `\n${folderContent}`

  finalSasFileContent += `\n${buildTerm}`
  finalSasFileContent = removeComments(finalSasFileContent)

  process.logger?.info(`Creating file ${finalFilePath}.`)
  await createFile(finalFilePath, finalSasFileContent)
  process.logger?.success(`File ${finalFilePath} has been created.`)

  process.logger?.info(`Creating file ${finalFilePathJSON}.`)
  await createFile(
    finalFilePathJSON,
    JSON.stringify(folderContentJSON, null, 1)
  )
  process.logger?.success(`File ${finalFilePathJSON} has been created.`)
}

async function getBuildInfo(target: Target) {
  let buildConfig = ''
  const { serverType, appLoc, macroFolders } = target
  const createWebServiceScript = await getCreateWebServiceScript(serverType)
  buildConfig += `${createWebServiceScript}\n`
  const dependencyFilePaths = await getDependencyPaths(
    buildConfig,
    macroFolders
  )
  const dependenciesContent = await getDependencies(dependencyFilePaths)
  const buildVars = await getBuildVars(target)
  return `%global appLoc;\n%let appLoc=%sysfunc(coalescec(&appLoc,${appLoc})); /* metadata or files service location of your app */\n%let syscc=0;\noptions ps=max noquotelenmax;\n${buildVars}\n${dependenciesContent}\n${buildConfig}\n`
}

async function getCreateWebServiceScript(serverType: ServerType) {
  switch (serverType) {
    case ServerType.SasViya:
      return await readFile(
        `${getMacroCorePath()}/viya/mv_createwebservice.sas`
      )

    case ServerType.Sas9:
      return await readFile(
        `${getMacroCorePath()}/meta/mm_createwebservice.sas`
      )

    default:
      throw new Error(
        `Invalid server type: valid options are ${ServerType.SasViya} and ${ServerType.Sas9}`
      )
  }
}

function getWebServiceScriptInvocation(serverType: ServerType) {
  switch (serverType) {
    case ServerType.SasViya:
      return '%mv_createwebservice(path=&appLoc/&path, name=&service, code=sascode ,replace=yes)'
    case ServerType.Sas9:
      return '%mm_createwebservice(path=&appLoc/&path, name=&service, code=sascode ,replace=yes)'
    default:
      throw new Error(
        `Invalid server type: valid options are ${ServerType.SasViya} and ${ServerType.Sas9}`
      )
  }
}

/**
 * Folders inside of `SASJS` folder are converted to JSON structure.
 * That JSON file is used to deploy services and jobs.
 * Services are deployed as direct subfolders within the appLoc.
 * Jobs are deployed within a jobs folder within the appLoc.
 * @param {ServerType} serverType
 */
async function getFolderContent(serverType: ServerType) {
  const { buildDestinationFolder } = getConstants()
  const buildSubFolders = await getSubFoldersInFolder(buildDestinationFolder)

  let folderContent = ''
  let folderContentJSON: any = { members: [] }
  await asyncForEach(buildSubFolders, async (subFolder) => {
    const { content, contentJSON } = await getContentFor(
      path.join(buildDestinationFolder, subFolder),
      subFolder,
      serverType
    )

    folderContent += `\n${content}`

    folderContentJSON.members.push(contentJSON)
  })

  return { folderContent, folderContentJSON }
}

async function getDependencies(filePaths: string[]): Promise<string> {
  let dependenciesContent: string[] = []
  await asyncForEach([...new Set(filePaths)], async (filePath) => {
    const depFileContent = await readFile(filePath)
    dependenciesContent.push(depFileContent)
  })

  return dependenciesContent.join('\n')
}

async function getContentFor(
  folderPath: string,
  folderName: string,
  serverType: ServerType
) {
  let content = `\n%let path=${folderName === 'services' ? '' : folderName};\n`

  const contentJSON: any = {
    name: folderName,
    type: 'folder',
    members: []
  }

  const files = await getFilesInFolder(folderPath)

  await asyncForEach(files, async (file) => {
    const fileContent = await readFile(path.join(folderPath, file))
    const transformedContent = getServiceText(file, fileContent, serverType)

    content += `\n${transformedContent}\n`

    contentJSON?.members.push({
      name: file.replace('.sas', ''),
      type: 'service',
      code: removeComments(fileContent)
    })
  })

  const subFolders = await getSubFoldersInFolder(folderPath)

  await asyncForEach(subFolders, async (subFolder) => {
    const {
      content: childContent,
      contentJSON: childContentJSON
    } = await getContentFor(
      path.join(folderPath, subFolder),
      subFolder,
      serverType
    )
    contentJSON?.members.push(childContentJSON)
    content += childContent
  })

  return { content, contentJSON }
}

function getServiceText(
  serviceFileName: string,
  fileContent: string,
  serverType: ServerType
) {
  const serviceName = serviceFileName.replace('.sas', '')
  const sourceCodeLines = getLines(removeComments(fileContent))
  let content = ``
  sourceCodeLines.forEach((line) => {
    const escapedLine = line.split("'").join("''")
    if (escapedLine.trim()) {
      content += `\n put '${escapedLine.trim()}';`
    }
  })
  return `%let service=${serviceName};
filename sascode temp lrecl=32767;
data _null_;
file sascode;
${content}\n
run;
${getWebServiceScriptInvocation(serverType)}
filename sascode clear;
`
}

function getLines(text: string): string[] {
  if (!text) {
    return []
  }
  let lines = text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.trim())
  return lines
}

export async function getBuildVars(target: Target) {
  const targetBuildVars = target?.buildConfig?.macroVars ?? {}
  const { buildSourceFolder } = getConstants()
  const configuration = await getConfiguration(
    path.join(buildSourceFolder, 'sasjsconfig.json')
  )
  const commonBuildVars = configuration?.buildConfig?.macroVars ?? {}

  return convertVarsToSasFormat({ ...commonBuildVars, ...targetBuildVars })
}

const convertVarsToSasFormat = (vars: { [key: string]: string }): string => {
  const entries = Object.entries(vars)
  let varsContent = '\n'
  for (const [name, value] of entries) {
    const chunks = chunk(value)
    const chunkedString = chunks.join('%trim(\n)')
    varsContent += `%let ${name}=${chunkedString};\n`
  }

  return varsContent
}
