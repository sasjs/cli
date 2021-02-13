import path from 'path'
import { getProgramFolders, getMacroCorePath } from '../../utils/config'
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
import { asyncForEach } from '../../utils/utils'
import { Target, ServerType } from '@sasjs/utils/types'
import { getConstants } from '../../constants'
import { checkCompileStatus } from './internal/checkCompileStatus'
import { loadDependencies } from './internal/loadDependencies'
import * as compileModule from './compile'
import { getAllJobFolders } from './internal/getAllJobFolders'
import { getAllServiceFolders } from './internal/getAllServiceFolders'
import { getServerType } from './internal/getServerType'
import {
  getDestinationServicePath,
  getDestinationJobPath
} from './internal/getDestinationPath'

export async function compile(target: Target, forceCompile = false) {
  const result = await checkCompileStatus(target)

  // no need to compile again
  if (result.compiled && !forceCompile) {
    process.logger?.info('Skipping compilation.')
    process.logger?.info(result.message)
    return
  }

  await compileModule.copyFilesToBuildFolder(target).catch((error) => {
    process.logger?.error('Project compilation has failed.')
    throw error
  })

  await compileModule.compileJobsAndServices(target)
}

export async function copyFilesToBuildFolder(target: Target) {
  const { buildSourceFolder, buildDestinationFolder } = getConstants()

  await recreateBuildFolder()

  process.logger?.info(`Copying files to ${buildDestinationFolder} .`)

  try {
    const serviceFolders = await getAllServiceFolders(target)
    const jobFolders = await getAllJobFolders(target)

    await asyncForEach(serviceFolders, async (serviceFolder: string) => {
      const sourcePath = path.join(buildSourceFolder, serviceFolder)
      const destinationPath = getDestinationServicePath(sourcePath)
      await copy(sourcePath, destinationPath)
    })

    await asyncForEach(jobFolders, async (jobFolder) => {
      const sourcePath = path.join(buildSourceFolder, jobFolder)
      const destinationPath = getDestinationJobPath(sourcePath)
      await copy(sourcePath, destinationPath)
    })
  } catch (error) {
    process.logger?.error(
      `An error has occurred when copying files to ${buildDestinationFolder} .`
    )
    throw error
  }
}

export async function compileJobsAndServices(target: Target) {
  try {
    const serviceFolders = await getAllServiceFolders(target)
    const jobFolders = await getAllJobFolders(target)
    const macroFolders = target ? target.macroFolders : []
    const programFolders = await getProgramFolders(target)

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
  } catch (error) {
    process.logger?.error(
      'An error has occurred when compiling your jobs and services.'
    )

    throw error
  }
}

async function recreateBuildFolder() {
  const { buildDestinationFolder } = getConstants()
  process.logger?.info('Recreating build folder...')
  const pathExists = await fileExists(buildDestinationFolder)
  if (pathExists) {
    await deleteFolder(buildDestinationFolder)
  }
  await createFolder(buildDestinationFolder)
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

    case ServerType.Sas9:
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
        `Invalid server type: valid options are 'SASVIYA' and 'SAS9'.`
      )
  }
  content +=
    '/* provide additional debug info */\n' +
    '%put user=%mf_getuser();\n' +
    '%put pgm=&_program;\n' +
    '%put timestamp=%sysfunc(datetime(),datetime19.);\n'
  return content
}

const compileServiceFolder = async (
  target: Target,
  serviceFolder: string,
  macroFolders: string[],
  programFolders: string[]
) => {
  const { buildSourceFolder } = getConstants()
  const folderPath = path.join(buildSourceFolder, serviceFolder)
  const destinationPath = getDestinationServicePath(folderPath)
  const subFolders = await getSubFoldersInFolder(destinationPath)
  const filesNamesInPath = await getFilesInFolder(destinationPath)
  const errors: Error[] = []

  await asyncForEach(filesNamesInPath, async (fileName) => {
    const filePath = path.join(destinationPath, fileName)

    let dependencies = await loadDependencies(
      target,
      filePath,
      macroFolders,
      programFolders
    )

    const serverType = await getServerType(target)
    const preCode = await getPreCodeForServicePack(serverType)

    dependencies = `${preCode}\n${dependencies}`

    if (dependencies) await createFile(filePath, dependencies)
  })

  await asyncForEach(subFolders, async (subFolder) => {
    const fileNames = await getFilesInFolder(path.join(folderPath, subFolder))

    await asyncForEach(fileNames, async (fileName) => {
      const filePath = path.join(destinationPath, subFolder, fileName)

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
  const { buildSourceFolder } = getConstants()
  const folderPath = path.join(buildSourceFolder, jobFolder)
  const destinationPath = getDestinationJobPath(folderPath)
  const subFolders = await getSubFoldersInFolder(destinationPath)
  const filesNamesInPath = await getFilesInFolder(destinationPath)
  await asyncForEach(filesNamesInPath, async (fileName) => {
    const filePath = path.join(destinationPath, fileName)
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
      const filePath = path.join(destinationPath, subFolder, fileName)
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
