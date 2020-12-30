import { Target } from '@sasjs/utils'
import path from 'path'
import { getConstants } from '../../../constants'
import {
  fileExists,
  getSubFoldersInFolder,
  getFilesInFolder,
  folderExists
} from '../../../utils/file'
import { asyncForEach } from '../../../utils/utils'
import { getAllJobFolders } from './getAllJobFolders'
import { getAllServiceFolders } from './getAllServiceFolders'
import {
  getDestinationJobPath,
  getDestinationServicePath
} from './getDestinationPath'

export async function checkCompileStatus(target: Target) {
  const { buildDestinationFolder } = getConstants()

  const pathExists = await fileExists(buildDestinationFolder)
  if (!pathExists) {
    return {
      compiled: false,
      message: `Build folder ${buildDestinationFolder} doesn't exist.`
    }
  }

  const {
    areServiceFoldersMatching,
    reasons: serviceReasons
  } = await checkServiceFolders(target)
  const { areJobFoldersMatching, reasons: jobReasons } = await checkJobFolders(
    target
  )

  const compiled = areServiceFoldersMatching && areJobFoldersMatching
  return {
    compiled,
    message: compiled
      ? 'All services and jobs are already present.'
      : `Missing Services: ${serviceReasons.join(
          ', '
        )}\nMissing jobs: ${jobReasons.join(', ')}`
  }
}

/**
 * Checks if each file in each subfolder of the specified service folders
 * is present in the `sasjsbuild/services` folder.
 * @param {Target} target- the target to check job folders for.
 * @returns an object containing a boolean `areServiceFoldersMatching` and a list of reasons if not matching.
 */
const checkServiceFolders = async (target: Target) => {
  const serviceFolders = await getAllServiceFolders(target)
  const { buildSourceFolder } = getConstants()

  let areServiceFoldersMatching = true
  const reasons: string[] = []
  await asyncForEach(serviceFolders, async (serviceFolder) => {
    const sourcePath = path.join(buildSourceFolder, serviceFolder)
    const destinationPath = getDestinationServicePath(sourcePath)

    const { equal, reason } = await compareFolders(sourcePath, destinationPath)
    areServiceFoldersMatching = areServiceFoldersMatching && equal
    if (!equal) {
      reasons.push(reason)
    }
  })
  return { areServiceFoldersMatching, reasons }
}

/**
 * Checks if each file in each subfolder of the specified job folders
 * is present in the `sasjsbuild/jobs` folder.
 * @param {Target} target- the target to check job folders for.
 * @returns an object containing a boolean `areJobFoldersMatching` and a list of reasons if not matching.
 */
const checkJobFolders = async (target: Target) => {
  const jobFolders = await getAllJobFolders(target)
  const { buildSourceFolder } = getConstants()

  let areJobFoldersMatching = true
  const reasons: string[] = []
  await asyncForEach(jobFolders, async (jobFolder) => {
    const sourcePath = path.join(buildSourceFolder, jobFolder)
    const destinationPath = getDestinationJobPath(sourcePath)

    const { equal, reason } = await compareFolders(sourcePath, destinationPath)
    areJobFoldersMatching = areJobFoldersMatching && equal
    if (!equal) {
      reasons.push(reason)
    }
  })
  return { areJobFoldersMatching, reasons }
}

const compareFolders = async (sourcePath: string, destinationPath: string) => {
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

  const sourceFiles = (await getFilesInFolder(sourcePath)) as string[]
  const destinationFiles = (await getFilesInFolder(destinationPath)) as string[]

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

  return {
    equal: true,
    reason: 'All files and subfolders are matching.'
  }
}
