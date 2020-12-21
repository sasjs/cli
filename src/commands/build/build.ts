import path from 'path'
import chalk from 'chalk'
import { Target, ServerType } from '@sasjs/utils/types'
import { deploy } from '../deploy'
import { createWebAppServices } from '../web'
import {
  readFile,
  getSubFoldersInFolder,
  getFilesInFolder,
  createFile,
  fileExists
} from '../../utils/file'
import { asyncForEach, removeComments, chunk } from '../../utils/utils'
import {
  getConfiguration,
  findTargetInConfiguration,
  getMacroCorePath
} from '../../utils/config-utils'
import { compile } from '../compile/compile'
import { getConstants } from '../../constants'
import { getBuildInit, getBuildTerm } from './internal/config'
import { getDependencyPaths } from '../shared/dependencies'

export async function build(
  targetName: string,
  compileOnly = false,
  compileBuildOnly = false,
  compileBuildDeployOnly = false
) {
  const { target } = await findTargetInConfiguration(targetName)

  console.log(chalk.white(`Target appLoc: ${target.appLoc}`))

  if (compileBuildDeployOnly) {
    await compile(targetName)
    await createFinalSasFiles(target)
    return await deploy(targetName)
  }

  if (compileBuildOnly) {
    await compile(targetName)
    return await createFinalSasFiles(target)
  }
  if (compileOnly) return await compile(targetName)

  const result = await validCompiled(target)

  if (result.compiled) {
    // no need to compile again
    console.log(chalk.greenBright(result.message))
    console.log(chalk.white('Skipping compiling of build folders...'))
  } else {
    console.log(chalk.redBright(result.message))
    await compile(targetName)
  }

  await createFinalSasFiles(target)
}

async function createFinalSasFiles(target: Target) {
  console.log(chalk.red(JSON.stringify(target)))
  const { streamConfig } = target
  const streamWeb = streamConfig?.streamWeb ?? false
  if (streamWeb) {
    await createWebAppServices(null, target)
      .then(() =>
        console.log(
          chalk.greenBright.bold.italic(
            `Web app services have been successfully built!`
          )
        )
      )
      .catch((err) => {
        console.log(
          chalk.redBright(
            'An error has occurred when building web app services.',
            err
          )
        )
      })
  }
  await createFinalSasFile(target)
}

async function createFinalSasFile(target: Target) {
  const { buildConfig, serverType, macroFolders, name } = target
  const buildOutputFileName = buildConfig?.buildOutputFileName ?? `${name}.sas`
  const { buildDestinationFolder } = getConstants()
  console.log(
    chalk.greenBright(
      `Creating final ${chalk.cyanBright(buildOutputFileName)} file`
    )
  )
  let finalSasFileContent = ''
  const finalFilePath = path.join(buildDestinationFolder, buildOutputFileName)
  const finalFilePathJSON = path.join(buildDestinationFolder, `${name}.json`)
  const buildInfo = await getBuildInfo(target).catch((_) => {})

  if (!buildConfig) return

  finalSasFileContent += `\n${buildInfo}`

  const buildInit = await getBuildInit(target)
  const buildTerm = await getBuildTerm(target)

  // console.log(chalk.greenBright('  Loading dependencies for:'))
  // console.log(
  //   '  BuildInit -',
  //   chalk.greenBright(chalk.cyanBright(buildInitPath))
  // )
  // console.log(
  //   '  BuildTerm -',
  //   chalk.greenBright(chalk.cyanBright(buildTermPath))
  // )
  const dependencyFilePaths = await getDependencyPaths(
    `${buildTerm}\n${buildInit}`,
    macroFolders
  )
  const dependenciesContent = await getDependencies(dependencyFilePaths)

  finalSasFileContent += `\n${dependenciesContent}\n\n${buildInit}\n`

  console.log(chalk.greenBright('  - Compiling Services'))
  const { folderContent, folderContentJSON } = await getFolderContent(
    serverType
  )
  finalSasFileContent += `\n${folderContent}`

  finalSasFileContent += `\n${buildTerm}`
  finalSasFileContent = removeComments(finalSasFileContent)
  await createFile(finalFilePath, finalSasFileContent)
  await createFile(
    finalFilePathJSON,
    JSON.stringify(folderContentJSON, null, 1)
  )
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
        `Invalid server type: valid options are ${chalk.cyanBright(
          'SASVIYA'
        )} and ${chalk.cyanBright('SAS9')}`
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
        `Invalid server type: valid options are ${chalk.cyanBright(
          'SASVIYA'
        )} and ${chalk.cyanBright('SAS9')}`
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

    if (contentJSON.name === 'services') {
      folderContentJSON?.members.push(...contentJSON?.members)
    } else {
      folderContentJSON?.members.push(contentJSON)
    }
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

async function validCompiled(target: Target) {
  const {
    buildSourceFolder,
    buildDestinationFolder,
    buildDestinationServicesFolder,
    buildDestinationJobsFolder
  } = getConstants()
  const servicePathsToCompile = await getAllServicePaths(
    path.join(buildSourceFolder, 'sasjsconfig.json'),
    target
  )

  const jobPathsToCompile = await getAllJobPaths(
    path.join(buildSourceFolder, 'sasjsconfig.json'),
    target
  )

  const serviceFoldersToCompile = servicePathsToCompile.map((s) =>
    s.split('/').pop()
  )
  const servicesBuildFolders = [...new Set(serviceFoldersToCompile)]

  const jobFoldersToCompile = jobPathsToCompile.map((s) => s.split('/').pop())
  const jobsBuildFolders = [...new Set(jobFoldersToCompile)]
  const pathExists = await fileExists(buildDestinationFolder)
  if (!pathExists)
    return {
      compiled: false,
      message: `Build Folder doesn't exists: ${buildDestinationFolder}`
    }

  if (servicesBuildFolders.length) {
    const serviceSubFolders = await getSubFoldersInFolder(
      buildDestinationServicesFolder
    )
    const servicesPresent = servicesBuildFolders.every((folder) =>
      serviceSubFolders.includes(folder)
    )
    if (!servicesPresent)
      return { compiled: false, message: 'All services are not present.' }
  }

  if (jobsBuildFolders.length) {
    const jobSubFolders = await getSubFoldersInFolder(
      buildDestinationJobsFolder
    )

    const jobsPresent = jobsBuildFolders.every((folder) =>
      jobSubFolders.includes(folder)
    )
    if (!jobsPresent)
      return { compiled: false, message: 'All jobs are not present.' }
  }

  if (servicesBuildFolders.length == 0 && jobsBuildFolders.length == 0) {
    return {
      compiled: false,
      message: 'Either Services or Jobs should be present'
    }
  }

  let returnObj = {
    compiled: true,
    message: `All services and jobs are already present.`
  }

  await asyncForEach(servicesBuildFolders, async (buildFolder) => {
    if (returnObj.compiled) {
      const folderPath = path.join(buildDestinationServicesFolder, buildFolder)
      const subFolders = await getSubFoldersInFolder(folderPath)
      const filesNamesInPath = await getFilesInFolder(folderPath)
      if (subFolders.length == 0 && filesNamesInPath.length == 0) {
        returnObj = {
          compiled: false,
          message: `Service folder ${buildFolder} is empty.`
        }
      }
    }
  })

  if (returnObj.compiled) {
    await asyncForEach(jobsBuildFolders, async (buildFolder) => {
      const folderPath = path.join(buildDestinationJobsFolder, buildFolder)
      const subFolders = await getSubFoldersInFolder(folderPath)
      const filesNamesInPath = await getFilesInFolder(folderPath)
      if (subFolders.length == 0 && filesNamesInPath.length == 0) {
        returnObj = {
          compiled: false,
          message: `Jobs folder ${buildFolder} is empty.`
        }
      }
    })
  }

  return returnObj
}

async function getAllServicePaths(pathToFile: string, target: Target) {
  const configuration = await getConfiguration(pathToFile)
  let allServices: string[] = []

  if (
    configuration &&
    configuration.serviceConfig &&
    configuration.serviceConfig.serviceFolders
  )
    allServices = [
      ...allServices,
      ...configuration.serviceConfig.serviceFolders
    ]

  if (target && target.serviceConfig && target.serviceConfig.serviceFolders)
    allServices = [...allServices, ...target.serviceConfig.serviceFolders]

  return Promise.resolve(allServices)
}

async function getAllJobPaths(pathToFile: string, target: Target) {
  const configuration = await getConfiguration(pathToFile)
  let allJobs: string[] = []

  if (
    configuration &&
    configuration.jobConfig &&
    configuration.jobConfig.jobFolders
  )
    allJobs = [...allJobs, ...configuration.jobConfig.jobFolders]

  if (target && target.jobConfig && target.jobConfig.jobFolders)
    allJobs = [...allJobs, ...target.jobConfig.jobFolders]

  return Promise.resolve(allJobs)
}
