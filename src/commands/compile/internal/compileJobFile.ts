import { Target } from '@sasjs/utils/types'

import { createFile, SASJsFileType } from '@sasjs/utils'
import { loadDependencies } from './loadDependencies'

export async function compileJobFile(
  target: Target,
  filePath: string,
  macroFolders: string[],
  programFolders: string[],
  programVar: string = ''
) {
  let dependencies = await loadDependencies(
    target,
    filePath,
    macroFolders,
    programFolders,
    SASJsFileType.job
  )
  dependencies = `${programVar ? programVar + '\n' : ''}${dependencies}`

  await createFile(filePath, dependencies)
}
