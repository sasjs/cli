import {
  BuildConfig,
  DeployConfig,
  ServiceConfig,
  JobConfig
} from '@sasjs/utils/types/config'
import { Target } from '@sasjs/utils/types/target'

export interface Configuration {
  buildConfig?: BuildConfig
  deployConfig?: DeployConfig
  serviceConfig?: ServiceConfig
  jobConfig?: JobConfig
  macroFolders?: string[]
  programFolders?: string[]
  targets?: Target[]
}
