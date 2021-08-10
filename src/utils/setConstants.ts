import path from 'path'
import { getInstalledPath } from 'get-installed-path'
import { getLocalOrGlobalConfig } from './config'
import { getAbsolutePath } from './utils'

export const setConstants = async () => {
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
  const buildDestinationFolder = getAbsolutePath(
    buildOutputFolder,
    isLocal ? process.projectDir : homeDir
  )
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
  const buildDestinationResultsFolder = getAbsolutePath(
    buildResultsFolder,
    isLocal ? process.projectDir : homeDir
  )
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

  process.sasjsConstants = {
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
