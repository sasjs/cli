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
  buildDestinationResultsFolder: string
  buildDestinationResultsLogsFolder: string
  buildDestinationTestFolder: string
  macroCorePath: string
  contextName: string
  sas9CredentialsError: string
  invalidSasError: string
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
    configuration?.buildConfig?.buildOutputFolder ||
    (isLocal ? 'sasjsbuild' : '.sasjs/sasjsbuild')
  const buildResultsFolder =
    configuration?.buildConfig?.buildResultsFolder ||
    (isLocal ? 'sasjsresults' : '.sasjs/sasjsresults')
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
  const buildDestinationTestFolder = path.join(buildDestinationFolder, 'tests')
  const buildDestinationJobsFolder = path.join(buildDestinationFolder, 'jobs')
  const buildDestinationDbFolder = path.join(buildDestinationFolder, 'db')
  const buildDestinationDocsFolder = path.join(buildDestinationFolder, 'docs')
  const macroCorePath = isLocal
    ? path.join(buildSourceFolder, 'node_modules', '@sasjs/core')
    : await getMacroCoreGlobalPath()
  const buildDestinationResultsFolder = path.isAbsolute(buildResultsFolder)
    ? buildResultsFolder
    : path.join(isLocal ? process.projectDir : homeDir, buildResultsFolder)
  const buildDestinationResultsLogsFolder = path.join(
    buildDestinationResultsFolder,
    'logs'
  )
  const contextName = 'sasjs cli compute context'
  const sas9CredentialsError =
    'The following attributes were not found:' +
    '\n* SAS_USERNAME' +
    '\n* SAS_PASSWORD' +
    '\nPlease run "sasjs auth" for your specified target to apply the correct credentials.'

  const invalidSasError =
    'Url specified does not contain a valid sas program. Please provide valid url.'

  return {
    buildSourceFolder,
    buildSourceDbFolder,
    buildDestinationFolder,
    buildDestinationServicesFolder,
    buildDestinationJobsFolder,
    buildDestinationDbFolder,
    buildDestinationDocsFolder,
    buildDestinationResultsFolder,
    buildDestinationResultsLogsFolder,
    buildDestinationTestFolder,
    macroCorePath,
    contextName,
    sas9CredentialsError,
    invalidSasError
  }
}
