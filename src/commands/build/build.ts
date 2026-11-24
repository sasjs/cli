import {
  asyncForEach,
  chunk,
  createFile,
  folderExists,
  getDependencyPaths,
  readFile,
  removeHeader,
  ServerType,
  StreamConfig,
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
import {
  COMPILE_MANIFEST_NAME,
  compileTreeFileName,
  getCompileTree,
  loadDependencies
} from '../compile/internal'
import { getBuildInit, getBuildTerm } from './internal/config'
import { getLaunchPageCode } from './internal/getLaunchPageCode'
import { excludedFromPack, getDeploymentTree } from './internal/deploymentTree'
import { appManifest } from './internal/appManifest'
import { packageTree } from './internal/appBundle'
import { PUBLISH_FOLDER, publishFrontend } from './internal/publishFrontend'
import { buildMockSite } from './internal/mockSite/mockSite'

export { getWebServiceScriptInvocation } from './internal/webServiceInvocation'

export async function build(target: Target) {
  const { macroCorePath } = process.sasjsConstants

  if (macroCorePath === '') {
    throw new Error(
      `The @sasjs/core folder location is unknown.\n` +
        `Check that @sasjs/core is a dependency in the package.json, and \n` +
        `that the package has been installed.\n` +
        `Alternatively populate environment variable 'macroCorePath' with\n` +
        `the path to a local @sasjs/core package's root directory.`
    )
  }
  process.logger?.info(`@sasjs/core found at ${macroCorePath}`)

  // build packages the build folder, it does not produce it: compiling here
  // would make `build` and `bd` compile on a fresh clone, where the documented
  // workflow is to run compile (or cbd) first and treat the build folder as the
  // input - including when it has been adjusted by hand.
  if (
    process.sasjsConstants.buildDestinationFolder &&
    !(await folderExists(process.sasjsConstants.buildDestinationFolder))
  ) {
    throw new Error(
      `The build folder ${process.sasjsConstants.buildDestinationFolder} does not exist.\n` +
        `Run 'sasjs compile' (or 'sasjs cbd') first.`
    )
  }

  const streamConfig = await getStreamConfig(target)

  await createFinalSasFiles(target, streamConfig)

  // `mockWeb` opts the target into a standalone static site that runs the same
  // services in a browser, with no SAS and no SASjs Server. It is a third
  // artefact, built after the pack from the same compile output, and it is never
  // part of the pack: a site that needs a localhost static server is not the
  // frontend a server deploys, and the build folder is not where it lives.
  if (streamConfig.mockWeb) {
    const mockSite = await buildMockSite(target)
    process.logger?.info(
      `Mock site built at ${mockSite.outputFolder} - serve it over http to run the app in a browser (service workers need http, not file://). It is not deployed.`
    )
  }
}

/**
 * Reports what the pack holds. A SASjs target can legitimately produce a pack
 * with no SAS services at all - the services are stored programs for another
 * runtime - and that is exactly the case where an unreported zero would look
 * like a successful deploy.
 */
const logPackedFileCounts = (tree: FileTree | FolderMember) => {
  const counts = { services: 0, files: 0 }

  const walk = (folder: FileTree | FolderMember) => {
    for (const member of folder.members ?? []) {
      if (member.type === MemberType.service) counts.services++
      else if (member.type === MemberType.file) counts.files++
      else walk(member as FolderMember)
    }
  }

  walk(tree)

  process.logger?.info(
    `Packing ${counts.services} SAS ${
      counts.services === 1 ? 'service' : 'services'
    } and ${counts.files} ${counts.files === 1 ? 'file' : 'files'}.`
  )
}

async function createFinalSasFiles(target: Target, streamConfig: StreamConfig) {
  process.logger?.info('Creating output SAS and JSON files.')

  const streamWeb = streamConfig.streamWeb ?? false
  const { buildConfig, serverType, name } = target
  const macroFolders = await getMacroFolders(target)
  const buildOutputFileName = buildConfig?.buildOutputFileName ?? `${name}.sas`

  // SAS 9 registers the streamed entry page as a stored process whose program
  // is a file at the root of the build - the same folder the deploy script is
  // written to. One file name cannot be both, and the build would silently
  // overwrite the entry page with the script that creates it.
  if (
    streamWeb &&
    serverType === ServerType.Sas9 &&
    `${streamConfig.streamServiceName}.sas` === buildOutputFileName
  ) {
    throw new Error(
      `The streamed entry page and the build output would both be ${buildOutputFileName}. ` +
        `Set a different streamConfig.streamServiceName or buildConfig.buildOutputFileName.`
    )
  }

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

  // A SASjs Server target with `streamWeb` produces two real frontends: the
  // streamed copy inside the deployment, and the compiled frontend the server
  // publishes at `apps/<name>`. The second is built here, on disk, so it can be
  // inspected before it is packed - and so a stale one can be deleted before a
  // rebuild rather than silently reused.
  const packageBundle = target.serverType === ServerType.Sasjs && streamWeb
  const publishFolder = path.join(buildDestinationFolder, PUBLISH_FOLDER)
  if (packageBundle) {
    await publishFrontend(target, streamConfig, publishFolder)
  }

  const excluded = excludedFromPack(target, publishFolder)

  // The build's own outputs sit in the build folder's root, where the streamed
  // entry page also lands: the compile tree, the deploy script, the pack and its
  // zip. They are outputs of the previous step, not content to deploy, and a
  // second build over the same folder must not pack them. Matching those names
  // rather than their extensions leaves a project's own root file - a PWA
  // manifest.json, an asset manifest - in the deployment, where it belongs.
  const isBuildOutputFile = (fileName: string) =>
    fileName === `${name}.json` ||
    fileName === `${name}.json.zip` ||
    fileName === compileTreeFileName(name) ||
    fileName === COMPILE_MANIFEST_NAME ||
    fileName === buildOutputFileName

  const { folderContent, folderContentJSON } = await getDeploymentTree(
    serverType,
    buildDestinationFolder,
    excluded,
    isBuildOutputFile
  )

  logPackedFileCounts(folderContentJSON)

  const servicePackSASjs: ServicePackSASjs = {
    appLoc: target.appLoc,
    fileTree: folderContentJSON
  }

  finalSasFileContent += `\n${folderContent}`
  finalSasFileContent += `\n${buildTerm}`

  if (streamWeb) {
    // every server that streams says where the app landed, on the route it
    // serves it from - SASjs server's copy is not a special case any more
    finalSasFileContent += getLaunchPageCode(
      target.serverType,
      streamConfig.streamServiceName as string
    )

    // The deployment and the statement that it is an app travel together: one
    // upload carries the backend written to `appLoc` and the frontend published
    // as `apps/<name>`, and the server reads the manifest in the same request
    // that writes the files. It also means the zip a CI job keeps is everything
    // needed to publish.
    if (packageBundle) {
      const { folderContentJSON: frontendTree } = await getDeploymentTree(
        serverType,
        publishFolder
      )

      servicePackSASjs.fileTree = packageTree(
        folderContentJSON,
        frontendTree,
        appManifest(streamConfig, target.appLoc)
      )
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

    dependencyFilePaths = [
      ...new Set([...dependencyFilePaths, ...dependencyFilePathsForCreateFile])
    ]
  }

  const dependenciesContent = await getDepsContent(
    dependencyFilePaths,
    target,
    macroFolders
  )
  const buildVars = await getBuildVars(target)

  /* NOTE: keep %global as the first line - a leading /** comment block is
     stripped by removeHeader() when the final build file is assembled, so
     the guidance below must come AFTER code to survive into the output. */
  return `
%global appLoc;

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
  * Do NOT change compiled_apploc - it is not the deploy location, it is the
  * appLoc that was baked into the frontend files at build time.  It is used
  * by the swap= parameter of %mv_createfile to rewrite that string to the
  * runtime appLoc when streaming web (html/css/js) files are uploaded.
  * Changing it breaks dynamic appLoc switching (no strings will match).
  *
  */

%let compiled_apploc=${appLoc};
%let appLoc=%sysfunc(coalescec(&appLoc,&compiled_apploc));


${
  serverType === ServerType.Sas9
    ? `
/**
  * The serverName represents the SAS 9 logical server context
  * There is no programmatic (SAS code) way to obtain this
  * So it is taken from the sasjsconfig file OR supplied at runtime, eg:
  *
  * %let apploc=/my/apploc;
  * %let serverName=SASAppDC;
  * %inc thisfile;
  *
  */

%global serverName;
%let compiled_serverName=${serverName};
%let serverName=%sysfunc(coalescec(&serverName,&compiled_serverName));
`
    : ''
}

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
