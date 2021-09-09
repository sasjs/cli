import path from 'path'
import { Target, ServerType, StreamConfig } from '@sasjs/utils/types'
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
  getMacroFolders,
  getStreamConfig
} from '../../utils/config'
import { compile } from '../compile/compile'
import { getBuildInit, getBuildTerm } from './internal/config'
import { getLaunchPageCode } from './internal/getLaunchPageCode'
import { getDependencyPaths } from '../shared/dependencies'
import { isTestFile } from '../compile/internal/compileTestFile'
import { ServicePack, ServicePackMember } from '../../types'

export async function build(target: Target) {
  await compile(target)

  await createFinalSasFiles(target)
}

async function createFinalSasFiles(target: Target) {
  process.logger?.info('Creating output SAS and JSON files.')

  const streamConfig = await getStreamConfig(target)

  await createFinalSasFile(target, streamConfig)
}

async function createFinalSasFile(target: Target, streamConfig: StreamConfig) {
  const streamWeb = streamConfig.streamWeb ?? false
  const { buildConfig, serverType, name } = target
  const macroFolders = await getMacroFolders(target)
  const buildOutputFileName = buildConfig?.buildOutputFileName ?? `${name}.sas`

  const { buildDestinationFolder } = process.sasjsConstants

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
  // The buildConfig variable contains the files for which we are fetching
  // dependencies, eg mv_createwebservice.sas and mv_createfile.sas
  let buildConfig = ''
  const { serverType, appLoc } = target
  const macroFolders = await getMacroFolders(target)
  const createWebServiceScript = await getCreateWebServiceScript(serverType)
  buildConfig += `${createWebServiceScript}\n`

  // dependencyFilePaths contains the dependencies of each buildConfig file
  let dependencyFilePaths = await getDependencyPaths(buildConfig, macroFolders)

  if (target.serverType === ServerType.SasViya && streamWeb) {
    // In Viya the mv_createfile.sas program is used to deploy the content as
    // files (rather than SAS programs / Stored Processes like in SAS 9)
    // Therefore we have a build macro dependency in addition to
    // mv_createwebservice.sas
    const createFileScript = await getCreateFileScript(serverType)
    buildConfig += `${createFileScript}\n`
    const dependencyFilePathsForCreateFile = await getDependencyPaths(
      createFileScript,
      macroFolders
    )

    // The binary copy script is used to update the deployed index.html file in
    // streamed viya apps at deploy time
    const binaryCopyScript = await readFile(
      `${await getMacroCorePath()}/base/mp_binarycopy.sas`
    )
    buildConfig += `${binaryCopyScript}\n`
    const dependencyFilePathsForBinaryCopy = await getDependencyPaths(
      binaryCopyScript,
      macroFolders
    )

    dependencyFilePaths = [
      ...new Set([
        ...dependencyFilePaths,
        ...dependencyFilePathsForCreateFile,
        ...dependencyFilePathsForBinaryCopy
      ])
    ]
  }

  const dependenciesContent = await getDependencies(dependencyFilePaths)
  const buildVars = await getBuildVars(target)
  return `
/* The appLoc represents the metadata or files service location of your app */
%global appLoc;
%let appLoc=%sysfunc(coalescec(&appLoc,${appLoc}));
%let sasjs_clickmeservice=clickme;
%let syscc=0;
options ps=max nonotes nosgen nomprint nomlogic nosource2 nosource noquotelenmax;
/* user supplied build vars */
${buildVars}
/* user supplied build vars end */
/* system macro dependencies for build process */
${dependenciesContent}
/* system macro dependencies for build process end*/
/* system macros for build process */
${buildConfig}
/* system macros for build process end */
`
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
async function getFolderContent(serverType: ServerType): Promise<{
  folderContent: string
  folderContentJSON: ServicePack
}> {
  const { buildDestinationFolder } = process.sasjsConstants
  const buildSubFolders = await listSubFoldersInFolder(buildDestinationFolder)

  let folderContent = ''
  let folderContentJSON: ServicePack = { members: [] }
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
): Promise<{ content: string; contentJSON: ServicePackMember }> {
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
      : folderPath
          .replace(rootDirectory, '')
          .substr(1)
          .split(path.sep)
          .join('/')
  };\n`

  const contentJSON: ServicePackMember = {
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

      contentJSON.members!.push({
        name: file.replace(/.sas$/, ''),
        type: 'service',
        code: removeComments(fileContent)
      })
    } else {
      const fileContentEncoded = await base64EncodeFile(filePath)

      const transformedContent = getFileText(
        file,
        fileContentEncoded,
        serverType
      )
      content += `\n${transformedContent}\n`

      contentJSON.members!.push({
        name: file.replace(/.sas$/, ''),
        type: 'file',
        code: fileContentEncoded
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

    contentJSON.members!.push(childContentJSON)
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

function getFileText(
  fileName: string,
  fileContent: string,
  serverType: ServerType
) {
  const fileExtension = path.extname(fileName).substring(1).toUpperCase()

  const { content, maxLineLength } = getWebFileContent(
    fileContent,
    fileExtension
  )

  return `%let filename=${fileName};
filename filecode temp lrecl=${maxLineLength};
data _null_;
file filecode;
${content}\n
run;
${getWebServiceScriptInvocation(serverType, undefined, false, true)}
filename filecode clear;
`
}

function getWebFileContent(filecontent: string, type: string) {
  let parsedContent = ''

  const chunkedLines = chunk(filecontent)
  if (chunkedLines.length === 1) {
    parsedContent = ` put '${chunkedLines[0].split("'").join("''")}';\n`
  } else {
    let combinedLines = ''
    chunkedLines.forEach((chunkedLine, index) => {
      let text = ` put '${chunkedLine.split("'").join("''")}'`
      if (index !== chunkedLines.length - 1) text += '@;\n'
      else text += ';\n'

      combinedLines += text
    })
    parsedContent += combinedLines
  }
  const maxLineLength = Math.max(32767, filecontent.length)

  return { content: parsedContent, maxLineLength }
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
