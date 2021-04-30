import {
  folderExists,
  getSubFoldersInFolder,
  getFilesInFolder
} from '../../../utils/file'
import { isTestFile } from './compileTestFile'

export const compareFolders = async (
  sourcePath: string,
  destinationPath: string
) => {
  const sourcePathExists = await folderExists(sourcePath)
  const destinationPathExists = await folderExists(destinationPath)

  if (!sourcePathExists) {
    throw new Error(
      `Source path ${sourcePath} does not exist. Please check the \`serviceFolders\` and \`jobFolders\` in your target configuration and try again.`
    )
  }

  if (!destinationPathExists) {
    return {
      equal: false,
      reason: `Destination path ${destinationPath} does not exist.`
    }
  }

  const sourceSubFolders = (await getSubFoldersInFolder(sourcePath)) as string[]
  const destinationSubFolders = (await getSubFoldersInFolder(
    destinationPath
  )) as string[]

  const sourceFiles = (await getFilesInFolder(sourcePath).then((files) =>
    files.filter((file: string) => !isTestFile(file))
  )) as string[]
  const destinationFiles = (await getFilesInFolder(destinationPath)) as string[]

  const areSubFoldersMatching = sourceSubFolders.every((subFolder) =>
    destinationSubFolders.includes(subFolder)
  )

  if (!areSubFoldersMatching) {
    const missingSubFolders = sourceSubFolders.filter(
      (subFolder) => !destinationSubFolders.includes(subFolder)
    )
    return {
      equal: false,
      reason: `Subfolders missing from ${destinationPath}: ${missingSubFolders.join(
        ', '
      )}`
    }
  }

  const areFilesMatching = sourceFiles.every((file) =>
    destinationFiles.includes(file)
  )

  if (!areFilesMatching) {
    const missingFiles = sourceFiles.filter(
      (file) => !destinationFiles.includes(file)
    )
    return {
      equal: false,
      reason: `Files missing from ${destinationPath}: ${missingFiles.join(
        ', '
      )}`
    }
  }

  return {
    equal: true,
    reason: 'All files and subfolders are matching.'
  }
}
