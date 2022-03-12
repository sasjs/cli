import { Target, asyncForEach, folderExists } from '@sasjs/utils'
import { compareFolders } from './compareFolders'
import { getAllFolders, SasFileType } from './getAllFolders'
import {
  getDestinationJobPath,
  getDestinationServicePath
} from './getDestinationPath'

export async function checkCompileStatus(
  target: Target,
  exceptions?: string[]
) {
  const { buildDestinationFolder } = process.sasjsConstants
  const pathExists = await folderExists(buildDestinationFolder)

  if (!pathExists) {
    return {
      compiled: false,
      message: `Build folder ${buildDestinationFolder} doesn't exist.`
    }
  }

  const { areServiceFoldersMatching, reasons: serviceReasons } =
    await checkServiceFolders(target, exceptions)

  const { areJobFoldersMatching, reasons: jobReasons } = await checkJobFolders(
    target,
    exceptions
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
 * @param {string[]} exceptions- folders that should not be checked.
 * @returns an object containing a boolean `areServiceFoldersMatching` and a list of reasons if not matching.
 */
const checkServiceFolders = async (target: Target, exceptions?: string[]) => {
  const serviceFolders = await getAllFolders(target, SasFileType.Service)

  let areServiceFoldersMatching = true
  const reasons: string[] = []
  await asyncForEach(serviceFolders, async (serviceFolder) => {
    const destinationPath = getDestinationServicePath(serviceFolder)

    const { equal, reason } = await compareFolders(
      serviceFolder,
      destinationPath,
      exceptions
    )
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
 * @param {string[]} exceptions- folders that should not be checked.
 * @returns an object containing a boolean `areJobFoldersMatching` and a list of reasons if not matching.
 */
const checkJobFolders = async (target: Target, exceptions?: string[]) => {
  const jobFolders = await getAllFolders(target, SasFileType.Job)

  let areJobFoldersMatching = true
  const reasons: string[] = []
  await asyncForEach(jobFolders, async (jobFolder) => {
    const destinationPath = getDestinationJobPath(jobFolder)

    const { equal, reason } = await compareFolders(
      jobFolder,
      destinationPath,
      exceptions
    )
    areJobFoldersMatching = areJobFoldersMatching && equal
    if (!equal) {
      reasons.push(reason)
    }
  })
  return { areJobFoldersMatching, reasons }
}
