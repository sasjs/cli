import path from 'path'
import { Target } from '@sasjs/utils/types'

import { createFile } from '../../../utils/file'
import { loadDependencies } from './loadDependencies'

export async function compileJobFile(
  target: Target,
  filePath: string,
  macroFolders: string[],
  programFolders: string[]
) {
  const dependencies = await loadDependencies(
    target,
    filePath,
    macroFolders,
    programFolders,
    'job'
  )

  await createFile(filePath, dependencies)
}
