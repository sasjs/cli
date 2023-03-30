import { Target, isTestFile } from '@sasjs/utils'
import { getAllFolders, SasFileType } from './'
import path from 'path'

export const identifySasFile = async (
  target: Target,
  sourcePath: string
): Promise<SasFileType> => {
  if (isTestFile(sourcePath.split(path.sep).pop() as string)) {
    return SasFileType.Test
  }

  const serviceFolders = await getAllFolders(target, SasFileType.Service)

  if (serviceFolders.find((folder) => sourcePath.includes(folder))) {
    return SasFileType.Service
  }

  const jobFolders = await getAllFolders(target, SasFileType.Job)

  if (jobFolders.find((folder) => sourcePath.includes(folder))) {
    return SasFileType.Job
  }

  throw `Unable to identify file as ${SasFileType.Service}, ${SasFileType.Job} or ${SasFileType.Test}`
}
