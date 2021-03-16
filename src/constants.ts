import path from 'path'
import { getLocalOrGlobalConfig } from './utils/config'

interface Constants {
  buildSourceFolder: string
  buildSourceDbFolder: string
  buildDestinationFolder: string
  buildDestinationServicesFolder: string
  buildDestinationJobsFolder: string
  buildDestinationDbFolder: string
  buildDestinationDocsFolder: string
}

// process.projectDir sets in cli.js
export const getConstants = async (): Promise<Constants> => {
  const { configuration, isLocal } = await getLocalOrGlobalConfig().catch(
    () => ({
      configuration: null,
      isLocal: false
    })
  )

  const buildOutputFolder =
    configuration?.buildConfig?.buildOutputFolder || 'sasjsbuild'

  const buildSourceFolder = path.join(process.projectDir)
  const buildSourceDbFolder = path.join(process.projectDir, 'sasjs', 'db')

  const buildDestinationFolder = path.isAbsolute(buildOutputFolder)
    ? buildOutputFolder
    : isLocal
    ? path.join(process.projectDir, buildOutputFolder)
    : path.join(process.currentDir, buildOutputFolder)
  const buildDestinationServicesFolder = path.join(
    buildDestinationFolder,
    'services'
  )
  const buildDestinationJobsFolder = path.join(buildDestinationFolder, 'jobs')
  const buildDestinationDbFolder = path.join(buildDestinationFolder, 'db')
  const buildDestinationDocsFolder = path.join(buildDestinationFolder, 'docs')
  return {
    buildSourceFolder,
    buildSourceDbFolder,
    buildDestinationFolder,
    buildDestinationServicesFolder,
    buildDestinationJobsFolder,
    buildDestinationDbFolder,
    buildDestinationDocsFolder
  }
}
