import find from 'find'
import path from 'path'
import chalk from 'chalk'
import uniqBy from 'lodash.uniqby'
import groupBy from 'lodash.groupby'
import { Target, ServerType } from '@sasjs/utils/types'
import { deploy } from '../deploy'
import { createWebAppServices } from '../web'
import {
  readFile,
  getSubFoldersInFolder,
  getFilesInFolder,
  createFile,
  fileExists,
  folderExists,
  getList
} from '../../utils/file'
import { asyncForEach, removeComments, chunk, diff } from '../../utils/utils'
import {
  getSourcePaths,
  getConfiguration,
  findTargetInConfiguration,
  getMacroCorePath
} from '../../utils/config-utils'
import { compile } from '../compile'
import { getConstants } from '../../constants'
import { getBuildInit, getBuildTerm } from './config'

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
    return await deploy(targetName, target)
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
  const { streamConfig } = target
  const { streamWeb } = streamConfig
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
  const { buildConfig, appLoc, serverType, macroFolders, name } = target
  const { buildOutputFileName } = buildConfig
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
      folderContentJSON.members.push(...contentJSON.members)
    } else {
      folderContentJSON.members.push(contentJSON)
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

    contentJSON.members.push({
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
    contentJSON.members.push(childContentJSON)
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

export function getProgramList(
  fileContent: string
): { fileName: string; fileRef: string }[] {
  let programList = getList('<h4> SAS Programs </h4>', fileContent)
  programList = programList.map((l) => {
    const [fileName, fileRef] = l.split(' ')

    if (!fileName) {
      throw new Error(
        `SAS Program ${fileName} is missing file name. Please specify SAS program dependencies in the format: @li <filename> <fileref>`
      )
    }

    if (fileName && !fileRef) {
      throw new Error(
        `SAS Program ${fileName} is missing fileref. Please specify SAS program dependencies in the format: @li <filename> <fileref>`
      )
    }

    validateFileRef(fileRef)
    return { fileName, fileRef }
  })

  validateProgramsList(programList)

  return uniqBy(programList, 'fileName')
}

export function validateProgramsList(
  programsList: { fileName: string; fileRef: string }[]
) {
  const areFileRefsUnique =
    uniqBy(
      programsList.map((p) => p.fileRef),
      (x) => x.toLocaleUpperCase()
    ).length === programsList.length

  if (areFileRefsUnique) {
    return true
  }

  const duplicatePrograms: { fileName: string; fileRef: string }[] = []
  programsList.forEach((program, index, list) => {
    const duplicates = list.filter(
      (p, i) =>
        i !== index &&
        p.fileRef.toLocaleUpperCase() === program.fileRef.toLocaleUpperCase() &&
        !duplicatePrograms.some(
          (d) =>
            d.fileName === p.fileName &&
            d.fileRef.toLocaleUpperCase() === p.fileRef.toLocaleUpperCase()
        )
    )
    duplicatePrograms.push(...duplicates)
  })
  const groupedDuplicates = groupBy(duplicatePrograms, (x) =>
    x.fileRef.toLocaleUpperCase()
  )
  let errorMessage = ''
  Object.keys(groupedDuplicates).forEach((fileRef) => {
    errorMessage += `The following files have duplicate fileref '${fileRef}':\n${groupedDuplicates[
      fileRef
    ]
      .map((d) => d.fileName)
      .join(', ')}\n`
  })
  throw new Error(errorMessage)
}

export function validateFileRef(fileRef: string): boolean {
  if (!fileRef) {
    throw new Error('Missing file ref.')
  }

  if (fileRef.length > 8) {
    throw new Error(
      'File ref is too long. File refs can have a maximum of 8 characters.'
    )
  }

  if (!/^[_a-zA-Z][_a-zA-Z0-9]*/.test(fileRef)) {
    throw new Error(
      'Invalid file ref. File refs can only start with a letter or an underscore, and contain only letters, numbers and underscores.'
    )
  }

  return true
}

export async function getProgramDependencies(
  fileContent: string,
  programFolders: string[],
  buildSourceFolder: string
) {
  programFolders = (uniqBy as any)(programFolders)
  const programs = getProgramList(fileContent)
  if (programs.length) {
    const foundPrograms: string[] = []
    const foundProgramNames: string[] = []
    await asyncForEach(programFolders, async (programFolder) => {
      await asyncForEach(programs, async (program) => {
        const filePath = path.join(buildSourceFolder, programFolder)
        const filePaths = find.fileSync(program.fileName, filePath)
        if (filePaths.length) {
          const fileContent = await readFile(filePaths[0])
          if (!fileContent) {
            console.log(
              chalk.yellowBright(`File ${program.fileName} is empty.`)
            )
          }
          const programDependencyContent = getProgramDependencyText(
            fileContent,
            program.fileRef
          )
          foundPrograms.push(programDependencyContent)
          foundProgramNames.push(program.fileName)
        }
      })
    })

    const unfoundProgramNames = programs.filter(
      (program) => !foundProgramNames.includes(program.fileName)
    )
    if (unfoundProgramNames.length) {
      console.log(
        chalk.yellowBright(
          `The following files were listed under SAS Programs but could not be found:
${unfoundProgramNames.join(', ')}
Please check they exist in the folder(s) listed in the programFolders array of the sasjsconfig.json file.\n`
        )
      )
    }
    return foundPrograms.join('\n')
  }

  return ''
}

function getProgramDependencyText(
  fileContent: string,
  fileRef: string
): string {
  let output = `filename ${fileRef} temp;\ndata _null_;\nfile ${fileRef} lrecl=32767;\n`

  const sourceLines = fileContent
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((l) => !!l)

  sourceLines.forEach((line) => {
    const chunkedLines = chunk(line)
    if (chunkedLines.length === 1) {
      output += `put '${chunkedLines[0].split("'").join("''")}';\n`
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
      output += combinedLines
    }
  })

  output += 'run;'

  return output
}

export async function getDependencyPaths(
  fileContent: string,
  macroFolders: string[] = []
) {
  const { buildSourceFolder } = getConstants()
  const sourcePaths = await getSourcePaths(buildSourceFolder)
  if (macroFolders.length) {
    macroFolders.forEach((tm) => {
      const tgtMacroPath = path.join(buildSourceFolder, tm)
      sourcePaths.push(tgtMacroPath)
    })
  }

  const dependenciesHeader = fileContent.includes('<h4> SAS Macros </h4>')
    ? '<h4> SAS Macros </h4>'
    : '<h4> Dependencies </h4>'

  let dependencies = getList(dependenciesHeader, fileContent).filter((d) =>
    d.endsWith('.sas')
  )

  let dependencyPaths: string[] = []
  const foundDependencies: string[] = []

  await asyncForEach(sourcePaths, async (sourcePath) => {
    if (await folderExists(sourcePath)) {
      await asyncForEach(dependencies, async (dep) => {
        const filePaths = find.fileSync(dep, sourcePath)
        if (filePaths.length) {
          const fileContent = await readFile(filePaths[0])
          foundDependencies.push(dep)
          dependencyPaths.push(
            ...(await getDependencyPaths(fileContent, macroFolders))
          )
        }
        dependencyPaths.push(...filePaths)
      })
    } else {
      const errorMessage = `Source path ${sourcePath} does not exist.`

      console.log(chalk.redBright(errorMessage))

      const unFoundDependencies = diff(dependencies, foundDependencies)

      if (unFoundDependencies.length) {
        console.log(
          `${chalk.redBright(
            'Unable to locate dependencies: ' + unFoundDependencies.join(', ')
          )}`
        )
      }

      throw errorMessage
    }
  })

  dependencyPaths = prioritiseDependencyOverrides(
    dependencies,
    dependencyPaths,
    macroFolders
  )

  return [...new Set(dependencyPaths)]
}

export function prioritiseDependencyOverrides(
  dependencyNames: string[],
  dependencyPaths: string[],
  tgtMacros: string[] = []
) {
  dependencyNames.forEach((depFileName) => {
    const paths = dependencyPaths.filter((p) => p.includes(`/${depFileName}`))

    let overriddenDependencyPaths = paths.filter(
      (p) => !p.includes('node_modules')
    )
    if (tgtMacros.length) {
      const foundInTgtMacros = overriddenDependencyPaths.filter((p) => {
        const pathExist = tgtMacros.find((tm) => p.includes(tm))
        return pathExist ? true : false
      })
      if (foundInTgtMacros.length) overriddenDependencyPaths = foundInTgtMacros
    }

    if (
      overriddenDependencyPaths.length &&
      overriddenDependencyPaths.length != paths.length
    ) {
      const pathsToRemove = paths.filter(
        (el) => overriddenDependencyPaths.indexOf(el) < 0
      )
      dependencyPaths = dependencyPaths.filter(
        (el) => pathsToRemove.indexOf(el) < 0
      )
      if (overriddenDependencyPaths.length > 1) {
        // remove duplicates
        dependencyPaths = dependencyPaths.filter(
          (p) => p != overriddenDependencyPaths[0]
        )
        dependencyPaths.push(overriddenDependencyPaths[0])
      }
    }
  })

  return dependencyPaths
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
