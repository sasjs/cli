import { Target, asyncForEach, folderExists } from '@sasjs/utils'
import {
  compareFolders,
  getChangedFiles,
  getManifestFolders,
  getManifestStamps,
  getAllFolders,
  SasFileType,
  getDestinationJobPath,
  getDestinationServicePath
} from './'

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

  if (!areServiceFoldersMatching || !areJobFoldersMatching) {
    // Name only the side that is missing - the previous message always listed
    // both, so a job-only difference read as "Missing Services: " with nothing
    // after it.
    const reasons: string[] = []

    if (!areServiceFoldersMatching)
      reasons.push(`Missing Services: ${serviceReasons.join(', ')}`)

    if (!areJobFoldersMatching)
      reasons.push(`Missing jobs: ${jobReasons.join(', ')}`)

    return { compiled: false, message: reasons.join('\n') }
  }

  // Every file being present is not the same as every file being current: a
  // service that was edited keeps its name, so the folder check alone would
  // skip the compile and leave the stale copy in the build folder.
  const changedFiles = await getChangedFiles(
    await getManifestFolders(target),
    await getManifestStamps(target)
  )

  if (changedFiles.length) {
    return {
      compiled: false,
      message: `Changed since the last compile: ${changedFiles.join(', ')}`
    }
  }

  return {
    compiled: true,
    message: 'All services and jobs are already present and up to date.'
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
