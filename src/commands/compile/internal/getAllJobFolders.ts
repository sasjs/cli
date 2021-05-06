import { Target } from '@sasjs/utils'
import { getLocalOrGlobalConfig } from '../../../utils/config'

export async function getAllJobFolders(target: Target) {
  const { configuration } = await getLocalOrGlobalConfig()
  let allJobs: string[] = []

  if (configuration?.jobConfig?.jobFolders)
    allJobs = [...configuration.jobConfig.jobFolders]

  if (target?.jobConfig?.jobFolders)
    allJobs = [...allJobs, ...target.jobConfig.jobFolders]

  allJobs = allJobs.filter((s) => !!s) as string[]
  return [...new Set(allJobs)]
}
