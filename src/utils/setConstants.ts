import path from 'path'
import { getLocalOrGlobalConfig } from './config'
import { getNodeModulePath } from './utils'
import { getAbsolutePath, Target } from '@sasjs/utils'

export const contextName = 'sasjs cli compute context'

export const setConstants = async () => {
  const { configuration, isLocal } = await getLocalOrGlobalConfig().catch(
    () => ({
      configuration: null,
      isLocal: false
    })
  )
  const buildOutputFolder =
    configuration?.sasjsBuildFolder ||
    (isLocal ? 'sasjsbuild' : '.sasjs/sasjsbuild')

  const buildResultsFolder =
    configuration?.sasjsResultsFolder ||
    (isLocal ? 'sasjsresults' : '.sasjs/sasjsresults')

  const homeDir = require('os').homedir()

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
  const macroCorePath = await getNodeModulePath('@sasjs/core')

  const buildDestinationResultsFolder = getAbsolutePath(
    buildResultsFolder,
    isLocal ? process.projectDir : homeDir
  )
  const buildDestinationResultsLogsFolder = path.join(
    buildDestinationResultsFolder,
    'logs'
  )
  const sas9CredentialsError =
    'The following attributes were not found:' +
    '\n* SAS_USERNAME' +
    '\n* SAS_PASSWORD' +
    '\nPlease run "sasjs auth" for your specified target to apply the correct credentials.'

  const invalidSasError =
    'Url specified does not contain a valid sas program. Please provide valid url.'

  const sas9GUID = 'pZKd6F95jECvRQlN0LCfdA=='

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
    invalidSasError,
    sas9GUID
  }
}

export const updateSasjsConstants = (target: Target, isLocal: boolean) => {
  const homeDir = require('os').homedir()

  if (target.sasjsBuildFolder) {
    const buildOutputFolder = target.sasjsBuildFolder

    const buildDestinationFolder = getAbsolutePath(
      buildOutputFolder,
      isLocal ? process.projectDir : homeDir
    )

    process.sasjsConstants.buildDestinationFolder = buildDestinationFolder

    process.sasjsConstants.buildDestinationServicesFolder = path.join(
      buildDestinationFolder,
      'services'
    )

    process.sasjsConstants.buildDestinationTestFolder = path.join(
      buildDestinationFolder,
      'tests'
    )
    process.sasjsConstants.buildDestinationJobsFolder = path.join(
      buildDestinationFolder,
      'jobs'
    )
    process.sasjsConstants.buildDestinationDbFolder = path.join(
      buildDestinationFolder,
      'db'
    )
    process.sasjsConstants.buildDestinationDocsFolder = path.join(
      buildDestinationFolder,
      'docs'
    )
  }

  if (target.sasjsResultsFolder) {
    const buildResultsFolder = target.sasjsResultsFolder

    const buildDestinationResultsFolder = getAbsolutePath(
      buildResultsFolder,
      isLocal ? process.projectDir : homeDir
    )

    process.sasjsConstants.buildDestinationResultsFolder =
      buildDestinationResultsFolder

    process.sasjsConstants.buildDestinationResultsLogsFolder = path.join(
      buildDestinationResultsFolder,
      'logs'
    )
  }
}
