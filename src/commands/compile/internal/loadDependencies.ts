import {
  Target,
  readFile,
  SASJsFileType,
  loadDependenciesFile,
  DependencyHeader,
  CompileTree
} from '@sasjs/utils'
import { getLocalOrGlobalConfig, getBinaryFolders } from '../../../utils/config'
import path from 'path'
import dotenv from 'dotenv'

export async function loadDependencies(
  target: Target,
  filePath: string,
  macroFolders: string[],
  programFolders: string[],
  type: SASJsFileType,
  compileTree: CompileTree
) {
  process.logger?.info(`Loading dependencies for ${filePath}`)

  let fileContent = ''

  if (compileTree && Object.keys(compileTree).length) {
    const leaf = compileTree.getLeaf(filePath)

    if (leaf) fileContent = leaf.content
    else fileContent = await readFile(filePath)
  } else {
    fileContent = await readFile(filePath)
  }

  const { configuration } = await getLocalOrGlobalConfig()
  const { buildSourceFolder, macroCorePath } = process.sasjsConstants
  const binaryFolders = await getBinaryFolders(target)

  headerSyntaxNotices(fileContent)
  return await loadDependenciesFile({
    fileContent,
    filePath,
    configuration,
    target,
    type,
    macroFolders,
    programFolders,
    buildSourceFolder,
    macroCorePath,
    binaryFolders,
    compileTree
  })
}

const headerSyntaxNotices = (fileContent: string) => {
  if (fileContent.includes(DependencyHeader.DeprecatedMacro)) {
    const deprecationDate = new Date(2021, 10, 2)
    const today = new Date()

    if (today < deprecationDate) {
      process.logger?.warn(
        `Please use ${DependencyHeader.Macro} syntax to specify dependencies. Specifying dependencies with a ${DependencyHeader.DeprecatedMacro} syntax will not be supported starting from November 1, 2021.`
      )
    } else {
      throw new Error(
        `Using ${DependencyHeader.DeprecatedMacro} syntax is deprecated. Please use ${DependencyHeader.Macro} instead.`
      )
    }
  }

  if (fileContent.includes(DependencyHeader.DeprecatedInclude)) {
    const deprecationDate = new Date(2022, 4, 2)
    const warningDate = new Date(2022, 10, 2)
    const today = new Date()

    const message = `Please use ${DependencyHeader.Include} syntax to specify programs. Specifying programs with a ${DependencyHeader.DeprecatedInclude} syntax will not be supported starting from April 1, 2022.`
    if (today < warningDate) {
      process.logger?.info(message)
    } else if (today < deprecationDate) {
      process.logger?.warn(message)
    } else
      throw new Error(
        `Using ${DependencyHeader.DeprecatedInclude} syntax is deprecated. Please use ${DependencyHeader.Include} instead.`
      )
  }
}

export const getCompileTree = (target: Target): CompileTree =>
  new CompileTree(
    path.join(
      process.sasjsConstants.buildDestinationFolder,
      `${target?.name}_compileTree.json`
    )
  )
