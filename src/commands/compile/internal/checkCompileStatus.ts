import { Target } from '@sasjs/utils'
import path from 'path'
import { getConstants } from '../../../constants'
import {
  fileExists,
  getSubFoldersInFolder,
  getFilesInFolder
} from '../../../utils/file'
import { asyncForEach } from '../../../utils/utils'
import { getAllJobFolders } from './getAllJobFolders'
import { getAllServiceFolders } from './getAllServiceFolders'

export async function checkCompileStatus(target: Target) {
  const {
    buildDestinationFolder,
    buildDestinationServicesFolder,
    buildDestinationJobsFolder
  } = getConstants()
  const servicePathsToCompile = await getAllServiceFolders(target)

  const jobPathsToCompile = await getAllJobFolders(target)

  const serviceFoldersToCompile = servicePathsToCompile.map((s) =>
    s.split('/').pop()
  )
  const servicesBuildFolders = [...new Set(serviceFoldersToCompile)]

  const jobFoldersToCompile = jobPathsToCompile.map((s) => s.split('/').pop())
  const jobsBuildFolders = [...new Set(jobFoldersToCompile)]
  const pathExists = await fileExists(buildDestinationFolder)
  if (!pathExists)
    return {
      compiled: false,
      message: `Build Folder doesn't exists: ${buildDestinationFolder}`
    }

  if (servicesBuildFolders.length) {
    const serviceSubFolders = await getSubFoldersInFolder(
      buildDestinationServicesFolder
    )
    const servicesPresent = servicesBuildFolders.every((folder) =>
      serviceSubFolders.includes(folder)
    )
    if (!servicesPresent)
      return { compiled: false, message: 'All services are not present.' }
  }

  if (jobsBuildFolders.length) {
    const jobSubFolders = await getSubFoldersInFolder(
      buildDestinationJobsFolder
    )

    const jobsPresent = jobsBuildFolders.every((folder) =>
      jobSubFolders.includes(folder)
    )
    if (!jobsPresent)
      return { compiled: false, message: 'All jobs are not present.' }
  }

  if (servicesBuildFolders.length == 0 && jobsBuildFolders.length == 0) {
    return {
      compiled: false,
      message: 'Either Services or Jobs should be present'
    }
  }

  let returnObj = {
    compiled: true,
    message: `All services and jobs are already present.`
  }

  await asyncForEach(servicesBuildFolders, async (buildFolder) => {
    if (returnObj.compiled) {
      const folderPath = path.join(buildDestinationServicesFolder, buildFolder)
      const subFolders = await getSubFoldersInFolder(folderPath)
      const filesNamesInPath = await getFilesInFolder(folderPath)
      if (subFolders.length == 0 && filesNamesInPath.length == 0) {
        returnObj = {
          compiled: false,
          message: `Service folder ${buildFolder} is empty.`
        }
      }
    }
  })

  if (returnObj.compiled) {
    await asyncForEach(jobsBuildFolders, async (buildFolder) => {
      const folderPath = path.join(buildDestinationJobsFolder, buildFolder)
      const subFolders = await getSubFoldersInFolder(folderPath)
      const filesNamesInPath = await getFilesInFolder(folderPath)
      if (subFolders.length == 0 && filesNamesInPath.length == 0) {
        returnObj = {
          compiled: false,
          message: `Jobs folder ${buildFolder} is empty.`
        }
      }
    })
  }

  return returnObj
}
