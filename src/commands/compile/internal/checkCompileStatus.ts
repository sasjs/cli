import { Target } from '@sasjs/utils'
import path from 'path'
import { getConstants } from '../../../constants'
import { folderExists } from '../../../utils/file'
import { asyncForEach } from '@sasjs/utils/utils'
import { compareFolders } from './compareFolders'
import { getAllJobFolders } from './getAllJobFolders'
import { getAllServiceFolders } from './getAllServiceFolders'
import {
  getDestinationJobPath,
  getDestinationServicePath
} from './getDestinationPath'

export async function checkCompileStatus(target: Target) {
  const { buildDestinationFolder } = await getConstants()
  const pathExists = await folderExists(buildDestinationFolder)

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
  const { buildSourceFolder } = await getConstants()

  let areServiceFoldersMatching = true
  const reasons: string[] = []
  await asyncForEach(serviceFolders, async (serviceFolder) => {
    const sourcePath = path.isAbsolute(serviceFolder)
      ? serviceFolder
      : path.join(buildSourceFolder, serviceFolder)
    const destinationPath = await getDestinationServicePath(sourcePath)

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
  const { buildSourceFolder } = await getConstants()

  let areJobFoldersMatching = true
  const reasons: string[] = []
  await asyncForEach(jobFolders, async (jobFolder) => {
    const sourcePath = path.isAbsolute(jobFolder)
      ? jobFolder
      : path.join(buildSourceFolder, jobFolder)
    const destinationPath = await getDestinationJobPath(sourcePath)

    const { equal, reason } = await compareFolders(sourcePath, destinationPath)
    areJobFoldersMatching = areJobFoldersMatching && equal
    if (!equal) {
      reasons.push(reason)
    }
  })
  return { areJobFoldersMatching, reasons }
}
