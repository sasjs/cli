import { Target } from '@sasjs/utils'
import path from 'path'
import { getConstants } from '../../../constants'
import { getConfiguration } from '../../../utils/config'

export async function getAllJobFolders(target: Target) {
  const { buildSourceFolder } = getConstants()
  const configuration = await getConfiguration(
    path.join(buildSourceFolder, 'sasjs', 'sasjsconfig.json')
  )
  let allJobs: string[] = []

  if (
    configuration &&
    configuration.jobConfig &&
    configuration.jobConfig.jobFolders
  )
    allJobs = [...configuration.jobConfig.jobFolders]

  if (target && target.jobConfig && target.jobConfig.jobFolders)
    allJobs = [...allJobs, ...target.jobConfig.jobFolders]

  allJobs = allJobs.filter((s) => !!s) as string[]
  return [...new Set(allJobs)]
}
