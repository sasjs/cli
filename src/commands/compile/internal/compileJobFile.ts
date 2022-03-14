import { Target } from '@sasjs/utils/types'
import {
  createFile,
  SASJsFileType,
  isTestFile,
  CompileTree
} from '@sasjs/utils'
import { loadDependencies } from './loadDependencies'

export async function compileJobFile(
  target: Target,
  filePath: string,
  macroFolders: string[],
  programFolders: string[],
  programVar: string = '',
  compileTree: CompileTree
) {
  let dependencies = await loadDependencies(
    target,
    filePath,
    macroFolders,
    programFolders,
    isTestFile(filePath) ? SASJsFileType.test : SASJsFileType.job,
    compileTree
  )

  dependencies = `${programVar ? programVar + '\n' : ''}${dependencies}`

  await createFile(filePath, dependencies)
}
