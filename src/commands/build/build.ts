import path from 'path'
import { Target, ServerType } from '@sasjs/utils/types'
import { createWebAppServices } from '../web'
import {
  readFile,
  base64EncodeFile,
  listSubFoldersInFolder,
  listFilesInFolder,
  createFile,
  asyncForEach
} from '@sasjs/utils'
import { removeComments, chunk } from '../../utils/utils'
import { isSasFile } from '../../utils/file'
import {
  getLocalConfig,
  getMacroCorePath,
  getMacroFolders
} from '../../utils/config'
import { compile } from '../compile/compile'
import { getConstants } from '../../constants'
import { getBuildInit, getBuildTerm } from './internal/config'
import { getLaunchPageCode } from './internal/getLaunchPageCode'
import { getDependencyPaths } from '../shared/dependencies'
import { StreamConfig } from '@sasjs/utils/types/config'
import { isTestFile } from '../compile/internal/compileTestFile'

export async function build(target: Target) {
  await compile(target)

  await createFinalSasFiles(target)
}

async function createFinalSasFiles(target: Target) {
  process.logger?.info('Creating output SAS and JSON files.')

  const localConfig = await getLocalConfig()

  const streamConfig = {
    ...localConfig?.streamConfig,
    ...target.streamConfig
  } as StreamConfig
  const streamWeb = streamConfig.streamWeb ?? false

  if (streamWeb) {
    process.logger?.info(
      'Building web app services since `streamWeb` is enabled.'
    )
    await createWebAppServices(target)
      .then(() => process.logger?.success(`Web app services have been built.`))
      .catch((err) => {
        process.logger?.error(
          'An error has occurred when building web app services.'
        )
        throw err
      })
  }
  await createFinalSasFile(target, streamConfig)
}

async function createFinalSasFile(target: Target, streamConfig: StreamConfig) {
  const streamWeb = streamConfig.streamWeb ?? false
  const { buildConfig, serverType, name } = target
  const macroFolders = await getMacroFolders(target)
  const buildOutputFileName = buildConfig?.buildOutputFileName ?? `${name}.sas`

  const { buildDestinationFolder } = await getConstants()

  let finalSasFileContent = ''
  const finalFilePath = path.join(buildDestinationFolder, buildOutputFileName)
  const finalFilePathJSON = path.join(buildDestinationFolder, `${name}.json`)
  const buildInfo = await getBuildInfo(target, streamWeb)

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

  if (streamWeb) {
    finalSasFileContent += getLaunchPageCode(
      target.serverType,
      streamConfig.streamServiceName
    )
  }

  finalSasFileContent = removeComments(finalSasFileContent)

  process.logger?.debug(`Creating file ${finalFilePath} .`)
  await createFile(finalFilePath, finalSasFileContent)
  process.logger?.success(`File ${finalFilePath} has been created.`)

  process.logger?.debug(`Creating file ${finalFilePathJSON} .`)
  await createFile(
    finalFilePathJSON,
    JSON.stringify(folderContentJSON, null, 1)
  )
  process.logger?.success(`File ${finalFilePathJSON} has been created.`)
}

async function getBuildInfo(target: Target, streamWeb: boolean) {
  let buildConfig = ''
  const { serverType, appLoc } = target
  const macroFolders = await getMacroFolders(target)
  const createWebServiceScript = await getCreateWebServiceScript(serverType)
  buildConfig += `${createWebServiceScript}\n`

  let dependencyFilePaths = await getDependencyPaths(buildConfig, macroFolders)

  if (target.serverType === ServerType.SasViya && streamWeb) {
    const createFileScript = await getCreateFileScript(serverType)
    buildConfig += `${createFileScript}\n`

    const dependencyFilePathsForCreateFile = await getDependencyPaths(
      createFileScript,
      macroFolders
    )

    dependencyFilePaths = [
      ...new Set([...dependencyFilePaths, ...dependencyFilePathsForCreateFile])
    ]
  }

  const dependenciesContent = await getDependencies(dependencyFilePaths)
  const buildVars = await getBuildVars(target)
  return `%global appLoc;\n%let appLoc=%sysfunc(coalescec(&appLoc,${appLoc})); /* metadata or files service location of your app */\n%let sasjs_clickmeservice=clickme;\n%let syscc=0;\noptions ps=max nonotes nosgen nomprint nomlogic nosource2 nosource noquotelenmax;\n${buildVars}\n${dependenciesContent}\n${buildConfig}\n`
}

async function getCreateWebServiceScript(serverType: ServerType) {
  switch (serverType) {
    case ServerType.SasViya:
      return await readFile(
        `${await getMacroCorePath()}/viya/mv_createwebservice.sas`
      )

    case ServerType.Sas9:
      return await readFile(
        `${await getMacroCorePath()}/meta/mm_createwebservice.sas`
      )

    default:
      throw new Error(
        `Invalid server type: valid options are ${ServerType.SasViya} and ${ServerType.Sas9}`
      )
  }
}

async function getCreateFileScript(serverType: ServerType) {
  switch (serverType) {
    case ServerType.SasViya:
      return await readFile(
        `${await getMacroCorePath()}/viya/mv_createfile.sas`
      )

    default:
      throw new Error(
        `Invalid server type: valid option is ${ServerType.SasViya}`
      )
  }
}

function getWebServiceScriptInvocation(
  serverType: ServerType,
  filePath = '',
  isSASFile: boolean = true,
  encoded: boolean = false
) {
  const loc = filePath === '' ? 'services' : 'tests'

  switch (serverType) {
    case ServerType.SasViya:
      const encodedParam = encoded ? ', intype=BASE64' : ''
      return isSASFile
        ? `%mv_createwebservice(path=&appLoc/${loc}/&path, name=&service, code=sascode ,replace=yes)`
        : `%mv_createfile(path=&appLoc/${loc}/&path, name=&filename, inref=filecode${encodedParam})`
    case ServerType.Sas9:
      return `%mm_createwebservice(path=&appLoc/${loc}/&path, name=&service, code=sascode ,replace=yes)`
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
  const { buildDestinationFolder } = await getConstants()
  const buildSubFolders = await listSubFoldersInFolder(buildDestinationFolder)

  let folderContent = ''
  let folderContentJSON: any = { members: [] }
  await asyncForEach(buildSubFolders, async (subFolder) => {
    const { content, contentJSON } = await getContentFor(
      path.join(buildDestinationFolder, subFolder),
      path.join(buildDestinationFolder, subFolder),
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
  rootDirectory: string,
  folderPath: string,
  serverType: ServerType,
  testPath: string | undefined = undefined
) {
  const folderName = path.basename(folderPath)
  if (!testPath && folderName === 'tests') {
    testPath = ''
  }

  const isRootDir = folderPath === rootDirectory
  let content = `\n%let path=${
    isRootDir
      ? ''
      : testPath !== undefined
      ? testPath
      : folderPath.replace(rootDirectory, '').substr(1)
  };\n`

  const contentJSON: any = {
    name: folderName,
    type: 'folder',
    members: []
  }

  const files = await listFilesInFolder(folderPath)

  await asyncForEach(files, async (file) => {
    const filePath = path.join(folderPath, file)

    if (isSasFile(file)) {
      const fileContent = await readFile(filePath)
      const transformedContent = getServiceText(
        file,
        fileContent,
        serverType,
        testPath
      )
      content += `\n${transformedContent}\n`

      contentJSON?.members.push({
        name: file.replace(/.sas$/, ''),
        type: 'service',
        code: removeComments(fileContent)
      })
    } else {
      const transformedContent = await getFileText(file, filePath, serverType)
      content += `\n${transformedContent}\n`

      contentJSON?.members.push({
        name: file.replace(/.sas$/, ''),
        type: 'file',
        path: filePath
      })
    }
  })

  const subFolders = await listSubFoldersInFolder(folderPath)

  await asyncForEach(subFolders, async (subFolder) => {
    const { content: childContent, contentJSON: childContentJSON } =
      await getContentFor(
        rootDirectory,
        path.join(folderPath, subFolder),
        serverType,
        testPath !== undefined
          ? testPath === ''
            ? subFolder
            : `${testPath}/${subFolder}`
          : undefined
      )

    contentJSON?.members.push(childContentJSON)
    content += childContent
  })

  return { content, contentJSON }
}

function getServiceText(
  serviceFileName: string,
  fileContent: string,
  serverType: ServerType,
  testPath: string | undefined
) {
  const serviceName = serviceFileName.replace(/.sas$/, '')
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
${getWebServiceScriptInvocation(
  serverType,
  isTestFile(serviceFileName) && testPath ? `${testPath}` : ''
)}
filename sascode clear;
`
}

async function getFileText(
  fileName: string,
  filePath: string,
  serverType: ServerType
) {
  const fileExtension = path.extname(fileName).substring(1).toUpperCase()

  const { content, encoded, maxLineLength } = await getWebFileContent(
    filePath,
    fileExtension
  )

  return `%let filename=${fileName};
filename filecode temp lrecl=${maxLineLength};
data _null_;
file filecode;
${content}\n
run;
${getWebServiceScriptInvocation(serverType, undefined, false, encoded)}
filename filecode clear;
`
}

async function getWebFileContent(filePath: string, type: string) {
  let lines,
    encoded = false

  const typesToEncode: string[] = [
    'ICO',
    'PNG',
    'JPG',
    'JPEG',
    'MP3',
    'OGG',
    'WAV'
  ]

  if (typesToEncode.includes(type)) {
    encoded = true
    lines = [await base64EncodeFile(filePath)]
  } else {
    lines = (await readFile(filePath))
      .replace(/\r\n/g, '\n')
      .split('\n')
      .filter((l) => !!l)
  }

  let parsedContent = '',
    maxLineLength = 32767

  lines.forEach((line) => {
    const chunkedLines = chunk(line)
    if (chunkedLines.length === 1) {
      parsedContent += ` put '${chunkedLines[0].split("'").join("''")}';\n`
    } else {
      let combinedLines = ''
      chunkedLines.forEach((chunkedLine, index) => {
        let text = ` put '${chunkedLine.split("'").join("''")}'`
        if (index !== chunkedLines.length - 1) {
          text += '@;\n'
        } else {
          text += ';\n'
        }
        combinedLines += text
      })
      parsedContent += combinedLines
    }
    maxLineLength = maxLineLength < line.length ? line.length : maxLineLength
  })

  return { content: parsedContent, encoded, maxLineLength }
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
  const configuration = await getLocalConfig()
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
