import { Target, asyncForEach, readFile, Configuration } from '@sasjs/utils'
import { getLocalOrGlobalConfig } from '../../../utils/config'
import { chunk } from '../../../utils/utils'
import {
  getDependencyPaths,
  getProgramDependencies
} from '../../shared/dependencies'
import {
  getServiceInit,
  getServiceTerm,
  getJobInit,
  getJobTerm,
  getTestInit,
  getTestTerm
} from './config'
import { isTestFile } from './compileTestFile'

export async function loadDependencies(
  target: Target,
  filePath: string,
  macroFolders: string[],
  programFolders: string[],
  type = 'service'
) {
  process.logger?.info(`Loading dependencies for ${filePath}`)

  let fileContent = await readFile(filePath)

  if (fileContent.includes('<h4> Dependencies </h4>')) {
    const deprecationDate = new Date(2021, 10, 2)
    const today = new Date()

    if (today < deprecationDate) {
      process.logger?.warn(
        `Please use <h4> SAS Macros </h4> syntax to specify dependencies. Specifying dependencies with a <h4> Dependencies </h4> syntax will not be supported starting from November 1, 2021.`
      )
    } else {
      throw new Error(
        'Using <h4> Dependencies </h4> syntax is deprecated. Please use <h4> SAS Macros </h4> instead.'
      )
    }
  }

  if (fileContent.includes('<h4> SAS Programs </h4>')) {
    const deprecationDate = new Date(2022, 4, 2)
    const warningDate = new Date(2022, 10, 2)
    const today = new Date()

    const message = `Please use <h4> SAS Includes </h4> syntax to specify programs. Specifying programs with a <h4> SAS Programs </h4> syntax will not be supported starting from April 1, 2022.`
    if (today < warningDate) process.logger?.info(message)
    else if (today < deprecationDate) process.logger?.warn(message)
    else
      throw new Error(
        'Using <h4> SAS Programs </h4> syntax is deprecated. Please use <h4> SAS Includes </h4> instead.'
      )
  }

  let init, initPath
  let term, termPath
  let serviceVars = ''
  let jobVars = ''
  let testVars = ''

  if (type === 'service' && !isTestFile(filePath)) {
    serviceVars = await getVars('service', target)
    ;({ content: init, filePath: initPath } = await getServiceInit(target))
    ;({ content: term, filePath: termPath } = await getServiceTerm(target))

    fileContent = fileContent
      ? `\n* Service start;\n${fileContent}\n* Service end;`
      : ''
  } else if (type === 'job' && !isTestFile(filePath)) {
    jobVars = await getVars('job', target)
    ;({ content: init, filePath: initPath } = await getJobInit(target))
    ;({ content: term, filePath: termPath } = await getJobTerm(target))

    fileContent = fileContent
      ? `\n* Job start;\n${fileContent}\n* Job end;`
      : ''
  } else {
    testVars = await getVars('test', target)
    ;({ content: init, filePath: initPath } = await getTestInit(target))
    ;({ content: term, filePath: termPath } = await getTestTerm(target))

    fileContent = fileContent
      ? `\n* Test start;\n${fileContent}\n* Test end;`
      : ''
  }

  init = init || ''
  initPath = initPath || ''
  term = term || ''
  termPath = termPath || ''

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

  const initProgramDependencies = await getProgramDependencies(
    init,
    programFolders,
    initPath
  )
  const termProgramDependencies = await getProgramDependencies(
    term,
    programFolders,
    termPath
  )

  const programDependencies = await getProgramDependencies(
    fileContent,
    programFolders,
    filePath
  )

  const dependenciesContent = await getDependencies(allDependencyPaths)

  fileContent = `* Dependencies start;\n${initProgramDependencies}\n${termProgramDependencies}\n${dependenciesContent}\n* Dependencies end;\n* Programs start;\n${programDependencies}\n*Programs end;${init}${fileContent}${term}`

  switch (type) {
    case 'service':
      fileContent = `* Service Variables start;\n${serviceVars}\n*Service Variables end;\n${fileContent}`
      break
    case 'job':
      fileContent = `* Job Variables start;\n${jobVars}\n*Job Variables end;\n${fileContent}`
      break
    case 'test':
      fileContent = `* Test Variables start;\n${testVars}\n*Test Variables end;\n${fileContent}`
      break
    default:
      break
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

export const getVars = async (
  varType: 'service' | 'job' | 'test',
  target: Target
) => {
  const getInternalVars = (config: Configuration | Target) =>
    varType === 'service'
      ? config?.serviceConfig?.macroVars
      : varType === 'job'
      ? config?.jobConfig?.macroVars
      : varType === 'test'
      ? config?.testConfig?.macroVars
      : {}

  const targetVars = getInternalVars(target)

  const { configuration } = await getLocalOrGlobalConfig()
  const commonServiceVars = getInternalVars(configuration)

  return convertVarsToSasFormat({ ...commonServiceVars, ...targetVars })
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
