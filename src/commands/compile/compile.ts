import chalk from 'chalk'
import path from 'path'
import {
  getProgramFolders,
  findTargetInConfiguration,
  getConfiguration,
  getMacroCorePath
} from '../../utils/config-utils'
import {
  getSubFoldersInFolder,
  getFilesInFolder,
  createFile,
  copy,
  fileExists,
  deleteFolder,
  createFolder,
  readFile
} from '../../utils/file'
import { asyncForEach, chunk } from '../../utils/utils'
import { Target, ServerType } from '@sasjs/utils/types'
import { Logger, LogLevel } from '@sasjs/utils/logger'
import { getConstants } from '../../constants'
import {
  getServiceInit,
  getServiceTerm,
  getJobInit,
  getJobTerm
} from './internal/config'
import {
  getDependencyPaths,
  getProgramDependencies
} from '../shared/dependencies'

export async function compile(targetName: string) {
  const logLevel = (process.env.LOG_LEVEL || LogLevel.Error) as LogLevel
  const logger = new Logger(logLevel)

  let { target } = await findTargetInConfiguration(targetName)

  await copyFilesToBuildFolder(target, logger)

  const serviceFolders = await getAllServiceFolders(target)
  const jobFolders = await getAllJobPaths(target)
  const macroFolders = target ? target.macroFolders : []
  const programFolders = await getProgramFolders(targetName)

  await asyncForEach(serviceFolders, async (serviceFolder) => {
    await compileServiceFolder(
      target,
      serviceFolder,
      macroFolders,
      programFolders
    )
  })

  await asyncForEach(jobFolders, async (jobFolder) => {
    await compileJobFolder(target, jobFolder, macroFolders, programFolders)
  })
}

async function copyFilesToBuildFolder(target: Target, logger: Logger) {
  const {
    buildSourceFolder,
    buildDestinationServicesFolder,
    buildDestinationJobsFolder
  } = getConstants()
  await recreateBuildFolder(logger)
  logger.info('Copying files to build folder...')
  const servicePaths = await getAllServiceFolders(target)

  const jobPaths = await getAllJobPaths(target)

  await asyncForEach(servicePaths, async (servicePath) => {
    const sourcePath = path.join(buildSourceFolder, 'services', servicePath)
    const destinationPath = path.join(
      buildDestinationServicesFolder,
      servicePath
    )
    await copy(sourcePath, destinationPath)
  })

  await asyncForEach(jobPaths, async (jobPath) => {
    const sourcePath = path.join(buildSourceFolder, jobPath)
    const destinationPath = path.join(buildDestinationJobsFolder, jobPath)
    await copy(sourcePath, destinationPath)
  })
}

async function recreateBuildFolder(logger: Logger) {
  const {
    buildDestinationFolder,
    buildDestinationServicesFolder
  } = getConstants()
  logger.info('Recreating build folder...')
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

async function getAllServiceFolders(target: Target) {
  const { buildSourceFolder } = getConstants()
  const configuration = await getConfiguration(
    path.join(buildSourceFolder, 'sasjsconfig.json')
  )
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

  allServices = allServices
    .map((s) => s.split('/').pop() || '')
    .filter((p) => !!p)
  return Promise.resolve([...new Set(allServices)])
}

async function getAllJobPaths(target: Target) {
  const { buildSourceFolder } = getConstants()
  const configuration = await getConfiguration(
    path.join(buildSourceFolder, 'sasjsconfig.json')
  )
  let allJobs: string[] = []

  if (
    configuration &&
    configuration.jobConfig &&
    configuration.jobConfig.jobFolders
  )
    allJobs = [...allJobs, ...configuration.jobConfig.jobFolders]

  if (target && target.jobConfig && target.jobConfig.jobFolders)
    allJobs = [...allJobs, ...target.jobConfig.jobFolders]

  allJobs = allJobs
    .map((s) => s.split('/').pop())
    .filter((s) => !!s) as string[]
  return Promise.resolve([...new Set(allJobs)])
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
  const logLevel = (process.env.LOG_LEVEL || LogLevel.Error) as LogLevel
  const logger = new Logger(logLevel)
  logger.info(`Loading dependencies for ${filePath}`)

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

const compileServiceFolder = async (
  target: Target,
  serviceFolder: string,
  macroFolders: string[],
  programFolders: string[]
) => {
  const { buildDestinationServicesFolder } = getConstants()
  const folderPath = path.join(buildDestinationServicesFolder, serviceFolder)
  const subFolders = await getSubFoldersInFolder(folderPath)
  const filesNamesInPath = await getFilesInFolder(folderPath)
  const errors: Error[] = []

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
}

const compileJobFolder = async (
  target: Target,
  jobFolder: string,
  macroFolders: string[],
  programFolders: string[]
) => {
  const { buildDestinationJobsFolder } = getConstants()
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
}
