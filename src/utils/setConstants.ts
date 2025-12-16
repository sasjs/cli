import path from 'path'
import { getNodeModulePath } from './utils'
import { Configuration, getAbsolutePath, Target } from '@sasjs/utils'

export const contextName = 'sasjs cli compute context'

export const setConstants = async (
  isLocal: boolean = true,
  target?: Target,
  configuration?: Configuration
) => {
  const buildOutputFolder =
    target?.sasjsBuildFolder ||
    configuration?.sasjsBuildFolder ||
    (isLocal ? 'sasjsbuild' : '.sasjs/sasjsbuild')

  const buildResultsFolder =
    target?.sasjsResultsFolder ||
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
  // Edge case: @sasjs/cli has a dependency on @sasjs/core.
  // When @sasjs/cli is used to submit a test of the @sasjs/core
  // repo, it is desirable to use that @sasjs/core repo as the dependency rather
  // than the older version in @sasjs/cli node_modules.
  // To achieve this, set environment variable `macroCorePath` to the root dir
  // of the local @sasjs/core package. If found, this takes precedence over
  // any node_modules installations of @sasjs/core.
  let macroCorePath = (process.env.macroCorePath as string) ?? ''
  if (macroCorePath === '') {
    // If no environment variable is set/populated then check for an installed
    // @sasjs/core in locations known to node.
    macroCorePath = await getNodeModulePath('@sasjs/core')
  }

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
