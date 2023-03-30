import {
  asyncForEach,
  base64EncodeFile,
  chunk,
  createFile,
  folderExists,
  getDependencyPaths,
  listFilesInFolder,
  listSubFoldersInFolder,
  readFile,
  removeHeader,
  ServerType,
  Target
} from '@sasjs/utils'
import { ServerTypeError } from '@sasjs/utils/error'
import path from 'path'

import {
  FileTree,
  FolderMember,
  MemberType,
  SASJsFileType,
  ServicePackSASjs
} from '@sasjs/utils/types'
import { compressAndSave } from '../../utils/compressAndSave'
import { getMacroFolders, getStreamConfig } from '../../utils/config'
import { isSasFile } from '../../utils/file'
import { compile } from '../compile/compile'
import { getCompileTree, loadDependencies } from '../compile/internal'
import { getBuildInit, getBuildTerm } from './internal/config'
import { getLaunchPageCode } from './internal/getLaunchPageCode'

export async function build(target: Target) {
  if (
    process.sasjsConstants.buildDestinationFolder &&
    !(await folderExists(process.sasjsConstants.buildDestinationFolder))
  ) {
    await compile(target)
  }

  await createFinalSasFiles(target)
}

async function createFinalSasFiles(target: Target) {
  process.logger?.info('Creating output SAS and JSON files.')

  const streamConfig = await getStreamConfig(target)

  const streamWeb = streamConfig.streamWeb ?? false
  const { buildConfig, serverType, name } = target
  const macroFolders = await getMacroFolders(target)
  const buildOutputFileName = buildConfig?.buildOutputFileName ?? `${name}.sas`

  const { buildDestinationFolder } = process.sasjsConstants

  let finalSasFileContent = ''
  const finalFilePath = path.join(buildDestinationFolder, buildOutputFileName)
  const finalFilePathJSON = path.join(buildDestinationFolder, `${name}.json`)
  const finalFilePathZipped = path.join(
    buildDestinationFolder,
    `${name}.json.zip`
  )
  const buildInfo = await getBuildInfo(target, streamWeb)

  finalSasFileContent += `\n${buildInfo}`

  const buildInit = await getBuildInit(target)
  const buildTerm = await getBuildTerm(target)

  const { macroCorePath } = process.sasjsConstants

  const dependencyFilePaths = await getDependencyPaths(
    `${buildTerm}\n${buildInit}`,
    macroFolders,
    macroCorePath
  )

  const dependenciesContent = await getDepsContent(
    dependencyFilePaths,
    target,
    macroFolders
  )

  finalSasFileContent += `\n${dependenciesContent}\n\n${buildInit}\n`

  const { folderContent, folderContentJSON } = await getFolderContent(
    serverType
  )

  const servicePackSASjs: ServicePackSASjs = {
    appLoc: target.appLoc,
    fileTree: folderContentJSON
  }

  finalSasFileContent += `\n${folderContent}`
  finalSasFileContent += `\n${buildTerm}`

  if (streamWeb) {
    if (
      target.serverType === ServerType.SasViya ||
      target.serverType === ServerType.Sas9
    ) {
      finalSasFileContent += getLaunchPageCode(
        target.serverType,
        streamConfig.streamServiceName
      )
    } else if (target.serverType === ServerType.Sasjs) {
      servicePackSASjs.streamLogo = streamConfig.streamLogo
      servicePackSASjs.streamServiceName = streamConfig.streamServiceName
      servicePackSASjs.streamWebFolder = streamConfig.streamWebFolder
    }
  }

  finalSasFileContent = removeHeader(finalSasFileContent)

  process.logger?.debug(`Creating file ${finalFilePath} .`)
  await createFile(finalFilePath, finalSasFileContent)
  process.logger?.success(`File ${finalFilePath} has been created.`)

  process.logger?.debug(`Creating file ${finalFilePathJSON} .`)

  const servicePack =
    target.serverType === ServerType.Sasjs
      ? servicePackSASjs
      : folderContentJSON
  await createFile(finalFilePathJSON, JSON.stringify(servicePack, null, 1))
  process.logger?.success(`File ${finalFilePathJSON} has been created.`)

  process.logger?.debug(`Creating file ${finalFilePathZipped} .`)
  await compressAndSave(
    finalFilePathZipped,
    JSON.stringify(servicePack, null, 1)
  )
  process.logger?.success(`File ${finalFilePathZipped} has been created.`)
}

async function getBuildInfo(target: Target, streamWeb: boolean) {
  // The buildConfig variable contains the files for which we are fetching
  // dependencies, eg mv_createwebservice.sas and mv_createfile.sas
  let buildConfig = ''
  const { serverType, appLoc, serverName } = target
  const macroFolders = await getMacroFolders(target)

  const createWebServiceScript = await getCreateWebServiceScript(serverType)
  const { macroCorePath } = process.sasjsConstants

  buildConfig += `${createWebServiceScript}\n`

  // dependencyFilePaths contains the dependencies of each buildConfig file
  let dependencyFilePaths = await getDependencyPaths(
    buildConfig,
    macroFolders,
    macroCorePath
  )

  if (target.serverType === ServerType.SasViya && streamWeb) {
    // In Viya the mv_createfile.sas program is used to deploy the content as
    // files (rather than SAS programs / Stored Processes like in SAS 9)
    // Therefore we have a build macro dependency in addition to
    // mv_createwebservice.sas
    const createFileScript = await getCreateFileScript(serverType)
    buildConfig += `${createFileScript}\n`
    const dependencyFilePathsForCreateFile = await getDependencyPaths(
      createFileScript,
      macroFolders,
      macroCorePath
    )

    // The gsubScript is used to perform the replacement of the appLoc within
    // the deployed index.html file.  This only happens when deploying using the
    // SAS Program (build.sas) approach.
    const gsubScript = await readFile(
      `${process.sasjsConstants.macroCorePath}/base/mp_replace.sas`
    )
    buildConfig += `${gsubScript}\n`
    const dependencyFilePathsForGsubScript = await getDependencyPaths(
      gsubScript,
      macroFolders,
      macroCorePath
    )

    dependencyFilePaths = [
      ...new Set([
        ...dependencyFilePaths,
        ...dependencyFilePathsForCreateFile,
        ...dependencyFilePathsForGsubScript
      ])
    ]
  }

  const dependenciesContent = await getDepsContent(
    dependencyFilePaths,
    target,
    macroFolders
  )
  const buildVars = await getBuildVars(target)

  return `
/**
  * The appLoc represents the metadata or SAS Drive location of the app you
  * are about to deploy
  *
  * To set an alternative appLoc, simply populate the appLoc variable prior
  * to running this program, eg:
  *
  * %let apploc=/my/apploc;
  * %inc thisfile;
  *
  */

%global appLoc serverName;
%let compiled_apploc=${appLoc};

${serverType === ServerType.Sas9 ? `%let serverName=${serverName};` : ''}

%let appLoc=%sysfunc(coalescec(&appLoc,&compiled_apploc));

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
${removeHeader(buildConfig)}
/* system macros for build process end */
`
}

async function getCreateWebServiceScript(serverType: ServerType) {
  const { macroCorePath } = process.sasjsConstants

  switch (serverType) {
    case ServerType.SasViya:
      return await readFile(`${macroCorePath}/viya/mv_createwebservice.sas`)

    case ServerType.Sas9:
      return await readFile(`${macroCorePath}/meta/mm_createwebservice.sas`)

    // FIXME: use sasjs/mv_createwebservice.sas ones created
    case ServerType.Sasjs:
      return await readFile(`${macroCorePath}/viya/mv_createwebservice.sas`)

    default:
      throw new ServerTypeError()
  }
}

async function getCreateFileScript(serverType: ServerType) {
  const { macroCorePath } = process.sasjsConstants

  switch (serverType) {
    case ServerType.SasViya:
      return await readFile(`${macroCorePath}/viya/mv_createfile.sas`)
    // FIXME: use sasjs/mv_createfile.sas ones created
    case ServerType.Sasjs:
      return await readFile(`${macroCorePath}/viya/mv_createfile.sas`)

    default:
      throw new ServerTypeError([ServerType.SasViya, ServerType.Sasjs])
  }
}

export function getWebServiceScriptInvocation(
  serverType: ServerType,
  isSASFile: boolean = true,
  encoded: boolean = false
) {
  const encodedParam = encoded ? ', intype=BASE64' : ''

  switch (serverType) {
    case ServerType.SasViya:
      return isSASFile
        ? `%mv_createwebservice(path=&appLoc/&path, name=&service, code=sascode,replace=yes)`
        : `%mv_createfile(path=&appLoc/&path, name=&filename, inref=filecode${encodedParam})`
    case ServerType.Sas9:
      return isSASFile
        ? `%mm_createwebservice(path=&appLoc/&path, name=&service, code=sascode, server=&serverName, replace=yes)`
        : `%mm_createwebservice(path=&appLoc/&path, name=&filename, code=filecode, server=&serverName, replace=yes)`
    case ServerType.Sasjs:
      return isSASFile
        ? `%mv_createwebservice(path=&appLoc/&path, name=&service, code=sascode,replace=yes)`
        : `%mv_createfile(path=&appLoc/&path, name=&filename, inref=filecode${encodedParam})`
    default:
      throw new ServerTypeError()
  }
}

/**
 * Folders inside of `SASJS` folder are converted to JSON structure.
 * That JSON file is used to deploy services, jobs and tests.
 * Services are deployed as direct subfolders within the appLoc.
 * Jobs are deployed within a jobs folder within the appLoc.
 * Tests are deployed within a tests folder within the appLoc.
 * @param {ServerType} serverType
 */
async function getFolderContent(serverType: ServerType): Promise<{
  folderContent: string
  folderContentJSON: FileTree
}> {
  const { buildDestinationFolder } = process.sasjsConstants
  const buildSubFolders = await listSubFoldersInFolder(buildDestinationFolder)

  let folderContent = ''
  const folderContentJSON: FileTree = { members: [] }
  await asyncForEach(buildSubFolders, async (subFolder) => {
    const { content, contentJSON } = await getContentFor(
      buildDestinationFolder,
      path.join(buildDestinationFolder, subFolder),
      serverType
    )

    folderContent += `\n${content}`

    folderContentJSON.members.push(contentJSON)
  })

  return { folderContent, folderContentJSON }
}

async function getContentFor(
  rootDirectory: string,
  folderPath: string,
  serverType: ServerType
): Promise<{ content: string; contentJSON: FolderMember }> {
  const folderName = path.basename(folderPath)

  let content = `\n%let path=${folderPath
    .replace(rootDirectory, '')
    .substr(1)
    .split(path.sep)
    .join('/')};\n`

  const contentJSON: FolderMember = {
    name: folderName,
    type: MemberType.folder,
    members: []
  }

  const files = await listFilesInFolder(folderPath)

  await asyncForEach(files, async (file) => {
    const filePath = path.join(folderPath, file)

    if (isSasFile(file)) {
      const fileContent = removeHeader(await readFile(filePath))
      const transformedContent = getServiceText(file, fileContent, serverType)
      content += `\n${transformedContent}\n`

      contentJSON.members!.push({
        name: file.replace(/.sas$/, ''),
        type: MemberType.service,
        code: removeHeader(fileContent)
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
        type: MemberType.file,
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
        serverType
      )

    contentJSON.members!.push(childContentJSON)
    content += childContent
  })

  return { content, contentJSON }
}

function getServiceText(
  serviceFileName: string,
  fileContent: string,
  serverType: ServerType
) {
  const serviceName = serviceFileName.replace(/.sas$/, '')
  const sourceCodeLines = getLines(fileContent)
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
${
  serverType !== ServerType.Sasjs
    ? getWebServiceScriptInvocation(serverType)
    : ''
}
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
${
  serverType !== ServerType.Sasjs
    ? getWebServiceScriptInvocation(serverType, false, true)
    : ''
}
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
  const configuration = process.sasjsConfig
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

const getDepsContent = async (
  deps: string[],
  target: Target,
  macroFolders: string[]
) => {
  let dependenciesContent = ''
  const compileTree = getCompileTree(target)

  await asyncForEach(deps, async (fp: string) => {
    dependenciesContent +=
      '\n' +
      (await loadDependencies(
        target,
        fp,
        macroFolders,
        [],
        SASJsFileType.file,
        compileTree
      ))
  })

  return dependenciesContent
}
