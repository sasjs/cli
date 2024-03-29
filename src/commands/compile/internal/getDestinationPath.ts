import path from 'path'

export const getDestinationServicePath = (inputPath: string): string => {
  if (!inputPath) {
    throw new Error(
      'Cannot get leaf folder name: input path is empty, null or undefined.'
    )
  }
  const { buildDestinationServicesFolder } = process.sasjsConstants

  const inputPathParts = inputPath.split(path.sep)
  const leafFolderName = inputPathParts.pop() as string
  return path.join(buildDestinationServicesFolder, leafFolderName)
}

export const getDestinationJobPath = (inputPath: string): string => {
  if (!inputPath) {
    throw new Error(
      'Cannot get leaf folder name: input path is empty, null or undefined.'
    )
  }
  const { buildDestinationJobsFolder } = process.sasjsConstants

  const inputPathParts = inputPath.split(path.sep)
  const leafFolderName = inputPathParts.pop() as string
  return path.join(buildDestinationJobsFolder, leafFolderName)
}
