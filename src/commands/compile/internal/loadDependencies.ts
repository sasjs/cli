import {
  CompileTree,
  DependencyHeader,
  loadDependenciesFile,
  readFile,
  removeHeader,
  SASJsFileType,
  Target
} from '@sasjs/utils'
import path from 'path'
import { getBinaryFolders } from '../../../utils/config'

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
    if (type === SASJsFileType.file) {
      // If file is of a generic type SASJsFileType.file, then just read the file content without header
      fileContent = removeHeader(await readFile(filePath))
    } else {
      const leaf = compileTree.getLeaf(filePath)

      if (leaf) fileContent = leaf.content
      else fileContent = await readFile(filePath)
    }
  } else {
    fileContent = await readFile(filePath)
  }

  const { buildSourceFolder, macroCorePath } = process.sasjsConstants
  const binaryFolders = await getBinaryFolders(target)
  const configuration = process.sasjsConfig

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
