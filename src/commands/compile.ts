import chalk from 'chalk'
import path from 'path'
import {
  getProgramFolders,
  findTargetInConfiguration,
  getConfiguration,
  getMacroCorePath
} from '../utils/config-utils'
import {
  getSubFoldersInFolder,
  getFilesInFolder,
  createFile,
  copy,
  fileExists,
  deleteFolder,
  createFolder,
  readFile
} from '../utils/file'
import { asyncForEach, chunk } from '../utils/utils'
import { Target, ServerType } from '@sasjs/utils/types'
import { getConstants } from '../constants'
import { getDependencyPaths, getProgramDependencies } from '.'
import {
  getServiceInit,
  getServiceTerm,
  getJobInit,
  getJobTerm
} from './build/config'

export async function compile(targetName: string) {
  const {
    buildSourceFolder,
    buildDestinationServicesFolder,
    buildDestinationJobsFolder
  } = getConstants()

  let { target } = await findTargetInConfiguration(targetName)

  await copyFilesToBuildFolder(target)

  const servicePathsToCompile = await getAllServicePaths(
    path.join(buildSourceFolder, 'sasjsconfig.json'),
    target
  )

  const serviceFoldersToCompile = servicePathsToCompile.map((s) =>
    s.split('/').pop()
  )
  const serviceFoldersToCompileUniq = [...new Set(serviceFoldersToCompile)]

  const jobPathsToCompile = await getAllJobPaths(
    path.join(buildSourceFolder, 'sasjsconfig.json'),
    target
  )

  const jobFoldersToCompile = jobPathsToCompile
    .map((s) => s.split('/').pop())
    .filter((s) => !!s) as string[]
  const jobFoldersToCompileUniq: string[] = [...new Set(jobFoldersToCompile)]

  if (
    serviceFoldersToCompileUniq.length == 0 &&
    jobFoldersToCompileUniq.length == 0
  )
    throw 'Either Services or Jobs should be present'

  const macroFolders = target ? target.macroFolders : []
  const programFolders = await getProgramFolders(targetName)

  const errors: Error[] = []

  await asyncForEach(serviceFoldersToCompileUniq, async (serviceFolder) => {
    const folderPath = path.join(buildDestinationServicesFolder, serviceFolder)
    const subFolders = await getSubFoldersInFolder(folderPath)
    const filesNamesInPath = await getFilesInFolder(folderPath)

    await asyncForEach(filesNamesInPath, async (fileName) => {
      const filePath = path.join(folderPath, fileName)

      let dependencies = await loadDependencies(
        target,
        filePath,
        macroFolders,
        programFolders
      )

      const preCode = await getPreCodeForServicePack(target.serverType)

      dependencies = `${preCode}\n${dependencies}`

      if (dependencies) await createFile(filePath, dependencies)
    })

    await asyncForEach(subFolders, async (subFolder) => {
      const fileNames = await getFilesInFolder(path.join(folderPath, subFolder))

      await asyncForEach(fileNames, async (fileName) => {
        const filePath = path.join(folderPath, subFolder, fileName)

        const dependencies = await loadDependencies(
          target,
          filePath,
          macroFolders,
          programFolders
        ).catch((err) => {
          errors.push(err)
        })

        if (dependencies) await createFile(filePath, dependencies)
      })
    })

    if (errors.length) throw errors
  })

  await asyncForEach(jobFoldersToCompileUniq, async (jobFolder) => {
    const folderPath = path.join(buildDestinationJobsFolder, jobFolder)
    const subFolders = await getSubFoldersInFolder(folderPath)
    const filesNamesInPath = await getFilesInFolder(folderPath)
    await asyncForEach(filesNamesInPath, async (fileName) => {
      const filePath = path.join(folderPath, fileName)
      const dependencies = await loadDependencies(
        target,
        filePath,
        macroFolders,
        programFolders,
        'job'
      )
      await createFile(filePath, dependencies)
    })
    await asyncForEach(subFolders, async (subFolder) => {
      const fileNames = await getFilesInFolder(path.join(folderPath, subFolder))
      await asyncForEach(fileNames, async (fileName) => {
        const filePath = path.join(folderPath, subFolder, fileName)
        const dependencies = await loadDependencies(
          target,
          filePath,
          macroFolders,
          programFolders,
          'job'
        )
        await createFile(filePath, dependencies)
      })
    })
  })
}

async function copyFilesToBuildFolder(target: Target) {
  const CONSTANTS = require('../constants').get()
  const buildSourceFolder = CONSTANTS.buildSourceFolder
  const buildDestinationFolder = CONSTANTS.buildDestinationFolder
  const buildDestinationServ = CONSTANTS.buildDestinationServ
  const buildDestinationJobs = CONSTANTS.buildDestinationJobs
  await recreateBuildFolder()
  console.log(chalk.greenBright('Copying files to build folder...'))
  const servicePathsToCompile = await getAllServicePaths(
    path.join(buildSourceFolder, 'sasjsconfig.json'),
    target
  )

  const jobsToCompile = await getAllJobPaths(
    path.join(buildSourceFolder, 'sasjsconfig.json'),
    target
  )

  await asyncForEach(servicePathsToCompile, async (buildFolder) => {
    const sourcePath = path.join(buildSourceFolder, buildFolder)
    const buildFolderName = buildFolder.split('/').pop()
    const destinationPath = path.join(buildDestinationServ, buildFolderName)
    await copy(sourcePath, destinationPath)
  })

  await asyncForEach(jobsToCompile, async (buildFolder) => {
    const sourcePath = path.join(buildSourceFolder, buildFolder)
    const buildFolderName = buildFolder.split('/').pop()
    const destinationPath = path.join(buildDestinationJobs, buildFolderName)
    await copy(sourcePath, destinationPath)
  })
}

async function recreateBuildFolder() {
  const {
    buildDestinationFolder,
    buildDestinationServicesFolder
  } = getConstants()
  console.log(chalk.greenBright('Recreating to build folder...'))
  const pathExists = await fileExists(buildDestinationFolder)
  if (pathExists) {
    // delete everything other than, db folder
    const subFolders = await getSubFoldersInFolder(buildDestinationFolder)
    const subFiles = await getFilesInFolder(buildDestinationFolder)
    await asyncForEach([...subFolders, ...subFiles], async (subFolder) => {
      if (subFolder == 'db') return
      const subFolderPath = path.join(buildDestinationFolder, subFolder)
      await deleteFolder(subFolderPath)
    })
  } else await createFolder(buildDestinationFolder)
  await createFolder(path.join(buildDestinationServicesFolder))
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

async function getPreCodeForServicePack(serverType: ServerType) {
  let content = ''
  const macroCorePath = getMacroCorePath()
  switch (serverType) {
    case ServerType.SasViya:
      content += await readFile(`${macroCorePath}/base/mf_getuser.sas`)
      content += await readFile(`${macroCorePath}/base/mp_jsonout.sas`)
      content += await readFile(`${macroCorePath}/viya/mv_webout.sas`)
      content +=
        '/* if calling viya service with _job param, _program will conflict */\n' +
        '/* so we provide instead as __program */\n' +
        '%global __program _program;\n' +
        '%let _program=%sysfunc(coalescec(&__program,&_program));\n' +
        '%macro webout(action,ds,dslabel=,fmt=);\n' +
        '%mv_webout(&action,ds=&ds,dslabel=&dslabel,fmt=&fmt)\n' +
        '%mend;\n'
      break

    case 'SAS9':
      content += await readFile(`${macroCorePath}/base/mf_getuser.sas`)
      content += await readFile(`${macroCorePath}/base/mp_jsonout.sas`)
      content += await readFile(`${macroCorePath}/meta/mm_webout.sas`)
      content +=
        '  %macro webout(action,ds,dslabel=,fmt=);\n' +
        '    %mm_webout(&action,ds=&ds,dslabel=&dslabel,fmt=&fmt)\n' +
        '  %mend;\n'
      break

    default:
      throw new Error(
        `Invalid server type: valid options are ${chalk.cyanBright(
          'SASVIYA'
        )} and ${chalk.cyanBright('SAS9')}`
      )
  }
  content +=
    '/* provide additional debug info */\n' +
    '%put user=%mf_getuser();\n' +
    '%put pgm=&_program;\n' +
    '%put timestamp=%sysfunc(datetime(),datetime19.);\n'
  return content
}

export async function loadDependencies(
  target: Target,
  filePath: string,
  macroFolders: string[],
  programFolders: string[],
  type = 'service'
) {
  console.log(
    chalk.greenBright('Loading dependencies for', chalk.cyanBright(filePath))
  )
  const { buildSourceFolder } = getConstants()
  let fileContent = await readFile(filePath)

  if (fileContent.includes('<h4> Dependencies </h4>')) {
    const deprecationDate = new Date(2021, 10, 2)
    const today = new Date()

    if (today < deprecationDate) {
      console.log(
        chalk.yellowBright(
          `WARNING: use <h4> SAS Macros </h4> syntax to specify dependencies. Specifying dependencies with a <h4> Dependencies </h4> syntax will not be supported starting from November 1, 2021.`
        )
      )
    } else {
      throw 'Using <h4> Dependencies </h4> syntax is deprecated. Please use <h4> SAS Macros </h4> instead.'
    }
  }

  let init
  let term
  let serviceVars = ''

  if (type === 'service') {
    serviceVars = await getServiceVars(target)

    init = await getServiceInit(target)

    term = await getServiceTerm(target)

    fileContent = fileContent
      ? `\n* Service start;\n${fileContent}\n* Service end;`
      : ''
  } else {
    init = await getJobInit(target)

    term = await getJobTerm(target)

    fileContent = fileContent
      ? `\n* Job start;\n${fileContent}\n* Job end;`
      : ''
  }

  const fileDependencyPaths = await getDependencyPaths(
    `${fileContent}\n${init}\n${term}`,
    macroFolders
  )
  const initDependencyPaths = await getDependencyPaths(init, macroFolders)
  const termDependencyPaths = await getDependencyPaths(term, macroFolders)
  const allDependencyPaths = [
    ...initDependencyPaths,
    ...fileDependencyPaths,
    ...termDependencyPaths
  ]
  const programDependencies = await getProgramDependencies(
    fileContent,
    programFolders,
    buildSourceFolder
  )

  const dependenciesContent = await getDependencies(allDependencyPaths)

  fileContent = `* Dependencies start;\n${dependenciesContent}\n* Dependencies end;\n* Programs start;\n${programDependencies}\n*Programs end;${init}${fileContent}${term}`

  if (type === 'service') {
    fileContent = `* Service Variables start;\n${serviceVars}\n*Service Variables end;\n${fileContent}`
  }

  return fileContent
}

async function getDependencies(filePaths: string[]): Promise<string> {
  let dependenciesContent: string[] = []
  await asyncForEach([...new Set(filePaths)], async (filePath) => {
    const depFileContent = await readFile(filePath)
    dependenciesContent.push(depFileContent)
  })

  return dependenciesContent.join('\n')
}

export async function getServiceVars(target: Target) {
  const targetServiceVars = target?.serviceConfig?.macroVars ?? {}
  const { buildSourceFolder } = getConstants()
  const configuration = await getConfiguration(
    path.join(buildSourceFolder, 'sasjsconfig.json')
  )
  const commonServiceVars = configuration?.serviceConfig?.macroVars ?? {}

  return convertVarsToSasFormat({ ...commonServiceVars, ...targetServiceVars })
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
