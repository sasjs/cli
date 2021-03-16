import path from 'path'
import { getConstants } from '../../../constants'

export const getDestinationServicePath = async (
  inputPath: string
): Promise<string> => {
  const { buildDestinationServicesFolder } = await getConstants()
  if (!inputPath) {
    throw new Error(
      'Cannot get leaf folder name: input path is empty, null or undefined.'
    )
  }

  const inputPathParts = inputPath.split(path.sep)
  const leafFolderName = inputPathParts.pop() as string
  return path.join(buildDestinationServicesFolder, leafFolderName)
}

export const getDestinationJobPath = async (
  inputPath: string
): Promise<string> => {
  const { buildDestinationJobsFolder } = await getConstants()
  if (!inputPath) {
    throw new Error(
      'Cannot get leaf folder name: input path is empty, null or undefined.'
    )
  }

  const inputPathParts = inputPath.split(path.sep)
  const leafFolderName = inputPathParts.pop() as string
  return path.join(buildDestinationJobsFolder, leafFolderName)
}
