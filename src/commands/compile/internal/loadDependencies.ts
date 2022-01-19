import {
  Target,
  readFile,
  SASJsFileType,
  loadDependenciesFile
} from '@sasjs/utils'
import { getLocalOrGlobalConfig, getBinaryFolders } from '../../../utils/config'

export async function loadDependencies(
  target: Target,
  filePath: string,
  macroFolders: string[],
  programFolders: string[],
  type: SASJsFileType
) {
  process.logger?.info(`Loading dependencies for ${filePath}`)

  const fileContent = await readFile(filePath)
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
    binaryFolders
  })
}

const headerSyntaxNotices = (fileContent: string) => {
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
    if (today < warningDate) {
      process.logger?.info(message)
    } else if (today < deprecationDate) {
      process.logger?.warn(message)
    } else
      throw new Error(
        'Using <h4> SAS Programs </h4> syntax is deprecated. Please use <h4> SAS Includes </h4> instead.'
      )
  }
}
