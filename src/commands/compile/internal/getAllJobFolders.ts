import { Target } from '@sasjs/utils'
import { getConstants } from '../../../constants'
import { getLocalOrGlobalConfig } from '../../../utils/config'
import { getAbsolutePath } from '../../../utils/utils'

export async function getAllJobFolders(target: Target) {
  const { configuration } = await getLocalOrGlobalConfig()
  let allJobs: string[] = []

  if (configuration?.jobConfig?.jobFolders)
    allJobs = [...configuration.jobConfig.jobFolders]

  if (target?.jobConfig?.jobFolders)
    allJobs = [...allJobs, ...target.jobConfig.jobFolders]

  allJobs = allJobs.filter((s) => !!s) as string[]

  const { buildSourceFolder } = await getConstants()
  allJobs = allJobs.map((job) => getAbsolutePath(job, buildSourceFolder))

  return [...new Set(allJobs)]
}
