import {
  Configuration,
  getAbsolutePath,
  JobConfig,
  ServiceConfig,
  Target
} from '@sasjs/utils'

export enum SasFileType {
  Service = 'service',
  Job = 'job',
  Test = 'test'
}

export const getAllFolders = async (
  target: Target,
  type: SasFileType.Service | SasFileType.Job,
  rootConfig?: Configuration
): Promise<string[]> => {
  const configuration = rootConfig || process.sasjsConfig

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
