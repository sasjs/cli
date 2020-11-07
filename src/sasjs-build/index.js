import find from 'find'
import path from 'path'
import chalk from 'chalk'
import uniqBy from 'lodash.uniqby'
import groupBy from 'lodash.groupby'
import { deploy } from '../sasjs-deploy'
import { createWebAppServices } from '../sasjs-web'
import {
  readFile,
  getSubFoldersInFolder,
  getFilesInFolder,
  createFile,
  createFolder,
  deleteFolder,
  fileExists,
  folderExists,
  copy,
  getList
} from '../utils/file-utils'
import { asyncForEach, removeComments, chunk, diff } from '../utils/utils'
import {
  getSourcePaths,
  getConfiguration,
  findTargetInConfiguration,
  getTargetSpecificFile,
  getMacroCorePath,
  getProgramFolders
} from '../utils/config-utils'

let buildSourceFolder = ''
let buildDestinationFolder = ''
let buildDestinationServ = ''
let buildDestinationJobs = ''
let targetToBuild = null

export async function build(
  targetName = null,
  compileOnly = false,
  compileBuildOnly = false,
  compileBuildDeployOnly = false,
  isForced = false
) {
  const CONSTANTS = require('../constants')

  buildSourceFolder = CONSTANTS.buildSourceFolder
  buildDestinationFolder = CONSTANTS.buildDestinationFolder
  buildDestinationServ = CONSTANTS.buildDestinationServ
  buildDestinationJobs = CONSTANTS.buildDestinationJobs

  const { target } = await findTargetInConfiguration(targetName)
  targetToBuild = target

  if (compileBuildDeployOnly) {
    await compile(targetName)
    await createFinalSasFiles()
    return await deploy(targetName, targetToBuild, isForced)
  }

  if (compileBuildOnly) {
    await compile(targetName)
    return await createFinalSasFiles()
  }
  if (compileOnly) return await compile(targetName)

  const servicePathsToCompile = await getAllServicePaths(
    path.join(buildSourceFolder, 'sasjsconfig.json')
  )

  const jobPathsToCompile = await getAllJobPaths(
    path.join(buildSourceFolder, 'sasjsconfig.json')
  )

  const serviceFoldersToCompile = servicePathsToCompile.map((s) =>
    s.split('/').pop()
  )
  const serviceFoldersToCompileUniq = [...new Set(serviceFoldersToCompile)]

  const jobFoldersToCompile = jobPathsToCompile.map((s) => s.split('/').pop())
  const jobFoldersToCompileUniq = [...new Set(jobFoldersToCompile)]

  const result = await validCompiled(
    serviceFoldersToCompileUniq,
    jobFoldersToCompileUniq
  )

  if (result.compiled) {
    // no need to compile again
    console.log(chalk.greenBright(result.message))
    console.log(chalk.white('Skipping compiling of build folders...'))
  } else {
    console.log(chalk.redBright(result.message))
    await compile()
  }

  await createFinalSasFiles()
}

async function compile(targetName) {
  await copyFilesToBuildFolder()

  const servicePathsToCompile = await getAllServicePaths(
    path.join(buildSourceFolder, 'sasjsconfig.json')
  )

  const serviceFoldersToCompile = servicePathsToCompile.map((s) =>
    s.split('/').pop()
  )
  const serviceFoldersToCompileUniq = [...new Set(serviceFoldersToCompile)]

  const jobPathsToCompile = await getAllJobPaths(
    path.join(buildSourceFolder, 'sasjsconfig.json')
  )

  const jobFoldersToCompile = jobPathsToCompile.map((s) => s.split('/').pop())
  const jobFoldersToCompileUniq = [...new Set(jobFoldersToCompile)]

  const tgtMacros = targetToBuild ? targetToBuild.tgtMacros : []
  const programFolders = await getProgramFolders(targetName)
  let { target } = await findTargetInConfiguration(targetName)

  const errors = []

  await asyncForEach(serviceFoldersToCompileUniq, async (serviceFolder) => {
    const folderPath = path.join(buildDestinationServ, serviceFolder)
    const subFolders = await getSubFoldersInFolder(folderPath)
    const filesNamesInPath = await getFilesInFolder(folderPath)

    await asyncForEach(filesNamesInPath, async (fileName) => {
      const filePath = path.join(folderPath, fileName)

      let dependencies = await loadDependencies(
        filePath,
        tgtMacros,
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
          filePath,
          tgtMacros,
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
    const folderPath = path.join(buildDestinationJobs, jobFolder)
    const subFolders = await getSubFoldersInFolder(folderPath)
    const filesNamesInPath = await getFilesInFolder(folderPath)
    await asyncForEach(filesNamesInPath, async (fileName) => {
      const filePath = path.join(folderPath, fileName)
      const dependencies = await loadDependencies(
        filePath,
        tgtMacros,
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
          filePath,
          tgtMacros,
          programFolders,
          'job'
        )
        await createFile(filePath, dependencies)
      })
    })
  })
}

async function createFinalSasFiles() {
  const {
    buildOutputFileName,
    appLoc,
    serverType,
    streamWeb,
    tgtMacros,
    name: tgtName
  } = targetToBuild
  if (streamWeb) {
    await createWebAppServices(null, targetToBuild)
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
  await createFinalSasFile(
    buildOutputFileName,
    appLoc,
    serverType,
    tgtMacros,
    tgtName
  )
}

async function createFinalSasFile(
  fileName = 'build.sas',
  appLoc,
  serverType,
  tgtMacros = [],
  tgtName = 'target'
) {
  console.log(
    chalk.greenBright(`Creating final ${chalk.cyanBright(fileName)} file`)
  )
  let finalSasFileContent = ''
  const finalFilePath = path.join(buildDestinationFolder, fileName)
  const finalFilePathJSON = path.join(buildDestinationFolder, `${tgtName}.json`)
  const buildConfig = await getBuildConfig(
    appLoc,
    serverType,
    tgtMacros
  ).catch((_) => {})

  if (!buildConfig) return

  finalSasFileContent += `\n${buildConfig}`

  const { content: buildInit, path: buildInitPath } = await getBuildInit()
  const {
    content: buildTermContent,
    path: buildTermPath
  } = await getBuildTerm()

  console.log(chalk.greenBright('  Loading dependencies for:'))
  console.log(
    '  BuildInit -',
    chalk.greenBright(chalk.cyanBright(buildInitPath))
  )
  console.log(
    '  BuildTerm -',
    chalk.greenBright(chalk.cyanBright(buildTermPath))
  )
  const dependencyFilePaths = await getDependencyPaths(
    `${buildTermContent}\n${buildInit}`,
    tgtMacros
  )
  const dependenciesContent = await getDependencies(dependencyFilePaths)

  finalSasFileContent += `\n${dependenciesContent}\n\n${buildInit}\n`

  console.log(chalk.greenBright('  - Compiling Services'))
  const { folderContent, folderContentJSON } = await getFolderContent(
    serverType
  )
  finalSasFileContent += `\n${folderContent}`

  finalSasFileContent += `\n${buildTermContent}`
  finalSasFileContent = removeComments(finalSasFileContent)
  await createFile(finalFilePath, finalSasFileContent)
  await createFile(
    finalFilePathJSON,
    JSON.stringify(folderContentJSON, null, 1)
  )
}

async function getBuildConfig(appLoc, serverType, tgtMacros = []) {
  let buildConfig = ''
  const createWebServiceScript = await getCreateWebServiceScript(serverType)
  buildConfig += `${createWebServiceScript}\n`
  const dependencyFilePaths = await getDependencyPaths(buildConfig, tgtMacros)
  const dependenciesContent = await getDependencies(dependencyFilePaths)
  const buildVars = await getBuildVars()
  return `%global appLoc;\n%let appLoc=%sysfunc(coalescec(&appLoc,${appLoc})); /* metadata or files service location of your app */\n%let syscc=0;\noptions ps=max noquotelenmax;\n${buildVars}\n${dependenciesContent}\n${buildConfig}\n`
}

async function getCreateWebServiceScript(serverType) {
  switch (serverType.toUpperCase()) {
    case 'SASVIYA':
      return await readFile(
        `${getMacroCorePath()}/viya/mv_createwebservice.sas`
      )

    case 'SAS9':
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

function getWebServiceScriptInvocation(serverType) {
  switch (serverType.toUpperCase()) {
    case 'SASVIYA':
      return '%mv_createwebservice(path=&appLoc/&path, name=&service, code=sascode ,replace=yes)'
    case 'SAS9':
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
 * @param {Server type as a string, either VIYA or SAS9} serverType
 */
async function getFolderContent(serverType) {
  const buildSubFolders = await getSubFoldersInFolder(buildDestinationFolder)

  let folderContent = ''
  let folderContentJSON = { members: [] }
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

async function getPreCodeForServicePack(serverType) {
  let content = ''
  switch (serverType.toUpperCase()) {
    case 'SASVIYA':
      content += await readFile(`${getMacroCorePath()}/base/mf_getuser.sas`)
      content += await readFile(`${getMacroCorePath()}/base/mp_jsonout.sas`)
      content += await readFile(`${getMacroCorePath()}/viya/mv_webout.sas`)
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
      content += await readFile(`${getMacroCorePath()}/base/mf_getuser.sas`)
      content += await readFile(`${getMacroCorePath()}/base/mp_jsonout.sas`)
      content += await readFile(`${getMacroCorePath()}/meta/mm_webout.sas`)
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
  return content
}

async function getContentFor(folderPath, folderName, serverType) {
  let content = `\n%let path=${folderName === 'services' ? '' : folderName};\n`
  const contentJSON = {
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

function getServiceText(serviceFileName, fileContent, serverType) {
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

function getLines(text) {
  let lines = text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.trim())
  return lines
}

async function copyFilesToBuildFolder() {
  await recreateBuildFolder()
  console.log(chalk.greenBright('Copying files to build folder...'))
  const servicePathsToCompile = await getAllServicePaths(
    path.join(buildSourceFolder, 'sasjsconfig.json')
  )

  const jobsToCompile = await getAllJobPaths(
    path.join(buildSourceFolder, 'sasjsconfig.json')
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
  await createFolder(path.join(buildDestinationServ))
}

export async function loadDependencies(
  filePath,
  tgtMacros,
  programFolders,
  type = 'service'
) {
  console.log(
    chalk.greenBright('Loading dependencies for', chalk.cyanBright(filePath))
  )
  let fileContent = await readFile(filePath)
  let init
  let term
  let serviceVars = ''

  if (type === 'service') {
    serviceVars = await getServiceVars()

    init = await getServiceInit()

    term = await getServiceTerm()

    fileContent = fileContent
      ? `\n* Service start;\n${fileContent}\n* Service end;`
      : ''
  } else {
    init = await getJobInit()

    term = await getJobTerm()

    fileContent = fileContent
      ? `\n* Job start;\n${fileContent}\n* Job end;`
      : ''
  }

  const dependencyFilePaths = await getDependencyPaths(
    `${fileContent}\n${init}\n${term}`,
    tgtMacros
  )
  const programDependencies = await getProgramDependencies(
    fileContent,
    programFolders,
    buildSourceFolder
  )

  const dependenciesContent = await getDependencies(dependencyFilePaths)

  fileContent = `* Dependencies start;\n${dependenciesContent}\n* Dependencies end;\n* Programs start;\n${programDependencies}\n*Programs end;${init}${fileContent}${term}`

  if (type === 'service') {
    fileContent = `* Service Variables start;\n${serviceVars}\n*Service Variables end;\n${fileContent}`
  }

  return fileContent
}

async function getBuildInit() {
  return await getTargetSpecificFile('BuildInit', targetToBuild)
}

async function getServiceInit() {
  const init = (await getTargetSpecificFile('ServiceInit', targetToBuild))
    .content
  return init ? `\n* ServiceInit start;\n${init}\n* ServiceInit end;` : ''
}

async function getJobInit() {
  const init = (await getTargetSpecificFile('jobInit', targetToBuild)).content
  return init ? `\n* JobInit start;\n${init}\n* JobInit end;` : ''
}

async function getServiceTerm() {
  const term = (await getTargetSpecificFile('ServiceTerm', targetToBuild))
    .content
  return term ? `\n* ServiceTerm start;\n${term}\n* ServiceTerm end;` : ''
}

async function getJobTerm() {
  const term = (await getTargetSpecificFile('jobTerm', targetToBuild)).content
  return term ? `\n* JobTerm start;\n${term}\n* JobTerm end;` : ''
}

async function getBuildTerm() {
  return await getTargetSpecificFile('BuildTerm', targetToBuild)
}

async function getTargetSpecificVars(typeOfVars) {
  let variables = {}
  const configuration = await getConfiguration(
    path.join(buildSourceFolder, 'sasjsconfig.json')
  )

  if (configuration && configuration[`cmn${typeOfVars}`])
    variables = { ...configuration[`cmn${typeOfVars}`] }

  if (targetToBuild && targetToBuild[`tgt${typeOfVars}`])
    variables = { ...variables, ...targetToBuild[`tgt${typeOfVars}`] }

  const entries = Object.entries(variables)
  let varsContent = '\n'
  for (const [name, value] of entries) {
    const chunks = chunk(value)
    const chunkedString = chunks.join('%trim(\n)')
    varsContent += `%let ${name}=${chunkedString};\n`
  }

  return varsContent
}

export async function getServiceVars() {
  return await getTargetSpecificVars('ServiceVars')
}

export async function getBuildVars() {
  return await getTargetSpecificVars('BuildVars')
}

async function getDependencies(filePaths) {
  let dependenciesContent = []
  await asyncForEach(filePaths, async (filePath) => {
    const depFileContent = await readFile(filePath)
    dependenciesContent.push(depFileContent)
  })

  return dependenciesContent.join('\n')
}

export function getProgramList(fileContent) {
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

export function validateProgramsList(programsList) {
  const areFileRefsUnique =
    uniqBy(
      programsList.map((p) => p.fileRef),
      (x) => x.toLocaleUpperCase()
    ).length === programsList.length

  if (areFileRefsUnique) {
    return true
  }

  const duplicatePrograms = []
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

export function validateFileRef(fileRef) {
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
  fileContent,
  programFolders,
  buildSourceFolder
) {
  programFolders = uniqBy(programFolders)
  const programs = getProgramList(fileContent)
  if (programs.length) {
    const foundPrograms = []
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
        } else {
          console.log(
            chalk.yellowBright(
              `Skipping ${program.fileName} as program file was not found. Please check your SAS program dependencies.\n`
            )
          )
        }
      })
    })

    return foundPrograms.join('\n')
  }

  return ''
}

function getProgramDependencyText(fileContent, fileRef) {
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

export async function getDependencyPaths(fileContent, tgtMacros = []) {
  const sourcePaths = await getSourcePaths(buildSourceFolder)
  if (tgtMacros.length) {
    tgtMacros.forEach((tm) => {
      const tgtMacroPath = path.join(buildSourceFolder, tm)
      sourcePaths.push(tgtMacroPath)
    })
  }
  const dependencies = getList(
    '<h4> Dependencies </h4>',
    fileContent
  ).filter((d) => d.endsWith('.sas'))

  let dependencyPaths = []
  const foundDependencies = []

  await asyncForEach(sourcePaths, async (sourcePath) => {
    if (await folderExists(sourcePath)) {
      await asyncForEach(dependencies, async (dep) => {
        const filePaths = find.fileSync(dep, sourcePath)
        if (filePaths.length) {
          const fileContent = await readFile(filePaths[0])
          foundDependencies.push(dep)
          dependencyPaths.push(
            ...(await getDependencyPaths(fileContent, tgtMacros))
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
    tgtMacros
  )

  return [...new Set(dependencyPaths)]
}

export function prioritiseDependencyOverrides(
  dependencyNames,
  dependencyPaths,
  tgtMacros = []
) {
  dependencyNames.forEach((depFileName) => {
    const paths = dependencyPaths.filter((p) => p.includes(`/${depFileName}`))

    let overriddenDependencyPaths = paths.filter(
      (p) => !p.includes('node_modules')
    )
    if (tgtMacros.length) {
      const foundInTgtMacros = overriddenDependencyPaths.filter((p) => {
        const pathExist = tgtMacros.find((tm) => p.includes(tgtMacros))
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

async function getCommonServices(pathToFile) {
  const configuration = await getConfiguration(pathToFile)
  return Promise.resolve(configuration.cmnServices)
}

async function getAllJobPaths(pathToFile) {
  const configuration = await getConfiguration(pathToFile)
  let allJobs = []

  if (configuration && configuration.jobs)
    allJobs = [...allJobs, ...configuration.jobs]

  if (targetToBuild && targetToBuild.jobs)
    allJobs = [...allJobs, ...targetToBuild.jobs]

  return Promise.resolve(allJobs)
}

async function getAllServicePaths(pathToFile) {
  const configuration = await getConfiguration(pathToFile)
  let allServices = []

  if (configuration && configuration.cmnServices)
    allServices = [...allServices, ...configuration.cmnServices]

  if (targetToBuild && targetToBuild.tgtServices)
    allServices = [...allServices, ...targetToBuild.tgtServices]

  return Promise.resolve(allServices)
}

async function validCompiled(servicesBuildFolders, jobsBuildFolders) {
  const pathExists = await fileExists(buildDestinationFolder)
  if (!pathExists)
    return {
      compiled: false,
      message: `Build Folder doesn't exists: ${buildDestinationFolder}`
    }

  const subFolders = await getSubFoldersInFolder(buildDestinationServ)

  const servicesPresent = servicesBuildFolders.every((folder) =>
    subFolders.includes(folder)
  )
  const jobsPresent = jobsBuildFolders.every((folder) =>
    subFolders.includes(folder)
  )

  if (servicesPresent && jobsPresent) {
    let returnObj = {
      compiled: true,
      message: `All services and jobs are already present.`
    }

    await asyncForEach(servicesBuildFolders, async (buildFolder) => {
      if (returnObj.compiled) {
        const folderPath = path.join(buildDestinationServ, buildFolder)
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
        const folderPath = path.join(buildDestinationServ, buildFolder)
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

  return { compiled: false, message: 'All services and jobs are not present.' }
}
