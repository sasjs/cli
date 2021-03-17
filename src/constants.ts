import path from 'path'
import { getInstalledPath } from 'get-installed-path'
import { getLocalOrGlobalConfig } from './utils/config'

interface Constants {
  buildSourceFolder: string
  buildSourceDbFolder: string
  buildDestinationFolder: string
  buildDestinationServicesFolder: string
  buildDestinationJobsFolder: string
  buildDestinationDbFolder: string
  buildDestinationDocsFolder: string
  macroCorePath: string
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
  const homeDir = require('os').homedir()
  const getMacroCoreGlobalPath = async () => {
    try {
      const sasjsPath = await getInstalledPath('@sasjs/cli')
      const macroCoreGlobal = path.join(
        sasjsPath,
        'node_modules',
        '@sasjs',
        'core'
      )
      return macroCoreGlobal
    } catch (e) {
      throw 'Please install SASjs cli `npm i -g @sasjs/cli`'
    }
  }

  const buildSourceFolder = path.join(isLocal ? process.projectDir : homeDir)
  const buildSourceDbFolder = path.join(
    isLocal ? process.projectDir : homeDir,
    'sasjs',
    'db'
  )
  const buildDestinationFolder = path.isAbsolute(buildOutputFolder)
    ? buildOutputFolder
    : path.join(isLocal ? process.projectDir : homeDir, buildOutputFolder)
  const buildDestinationServicesFolder = path.join(
    buildDestinationFolder,
    'services'
  )
  const buildDestinationJobsFolder = path.join(buildDestinationFolder, 'jobs')
  const buildDestinationDbFolder = path.join(buildDestinationFolder, 'db')
  const buildDestinationDocsFolder = path.join(buildDestinationFolder, 'docs')
  const macroCorePath = isLocal
    ? path.join(buildSourceFolder, 'node_modules', '@sasjs/core')
    : await getMacroCoreGlobalPath()

  return {
    buildSourceFolder,
    buildSourceDbFolder,
    buildDestinationFolder,
    buildDestinationServicesFolder,
    buildDestinationJobsFolder,
    buildDestinationDbFolder,
    buildDestinationDocsFolder,
    macroCorePath
  }
}
