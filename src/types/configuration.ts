import {
  DocConfig,
  BuildConfig,
  DeployConfig,
  ServiceConfig,
  JobConfig,
  StreamConfig,
  AuthConfig
} from '@sasjs/utils/types/config'
import { ServerType } from '@sasjs/utils/types/serverType'

export interface Configuration {
  $schema?: string
  docConfig?: DocConfig
  buildConfig?: BuildConfig
  deployConfig?: DeployConfig
  serviceConfig?: ServiceConfig
  jobConfig?: JobConfig
  streamConfig?: StreamConfig
  macroFolders?: string[]
  programFolders?: string[]
  targets?: TargetJson[]
}

export interface TargetJson {
  name: string
  serverUrl: string
  serverType: ServerType
  allowInsecureRequests: boolean
  contextName?: string
  serverName?: string
  repositoryName?: string
  appLoc: string
  docConfig?: DocConfig
  authConfig?: AuthConfig
  buildConfig?: BuildConfig
  deployConfig?: DeployConfig
  serviceConfig?: ServiceConfig
  jobConfig?: JobConfig
  streamConfig?: StreamConfig
  macroFolders: string[]
  programFolders: string[]
}
