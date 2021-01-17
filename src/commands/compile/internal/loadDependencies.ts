import { Target } from '@sasjs/utils'
import path from 'path'
import { getConstants } from '../../../constants'
import { getConfiguration } from '../../../utils/config'
import { readFile } from '../../../utils/file'
import { asyncForEach, chunk } from '../../../utils/utils'
import {
  getDependencyPaths,
  getProgramDependencies
} from '../../shared/dependencies'
import {
  getServiceInit,
  getServiceTerm,
  getJobInit,
  getJobTerm
} from './config'

export async function loadDependencies(
  target: Target,
  filePath: string,
  macroFolders: string[],
  programFolders: string[],
  type = 'service'
) {
  process.logger?.info(`Loading dependencies for ${filePath}`)

  const { buildSourceFolder } = getConstants()
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
