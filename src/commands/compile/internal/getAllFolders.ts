import { Target, getAbsolutePath, Configuration } from '@sasjs/utils'
import { getGlobalRcFile, getLocalConfig } from '../../../utils/config'
import { ServiceConfig, JobConfig } from '@sasjs/utils'

export enum SasFileType {
  Service = 'service',
  Job = 'job'
}

export const getAllFolders = async (
  target: Target,
  type: SasFileType,
  rootConfig?: Configuration
): Promise<string[]> => {
  const { isLocal } = process.sasjsConstants
  const configuration: Configuration =
    rootConfig || (isLocal ? await getLocalConfig() : await getGlobalRcFile())

  let allFolders: string[] | undefined
  let config: ServiceConfig | JobConfig | undefined
  let folders: string[] | undefined
  const addFolders = (folders: string[] | undefined) => {
    allFolders = [...(allFolders || []), ...(folders || [])]
  }

  if (type === SasFileType.Service) {
    config = configuration.serviceConfig
    folders = config?.serviceFolders

    addFolders(folders)

    config = target.serviceConfig
    folders = config?.serviceFolders
  } else {
    config = configuration.jobConfig
    folders = config?.jobFolders

    addFolders(folders)

    config = target.jobConfig
    folders = config?.jobFolders
  }

  addFolders(folders)

  if (!allFolders) return []

  allFolders = allFolders.filter((p) => !!p)

  const { buildSourceFolder } = process.sasjsConstants

  allFolders = allFolders.map((sasFile) =>
    getAbsolutePath(sasFile, buildSourceFolder)
  )

  return [...new Set(allFolders)]
}
