import { ServerType } from '@sasjs/utils/types'
import { TargetScope } from './targetScope'
import { TargetJson } from './configuration'

export interface CommonFields {
  scope: TargetScope
  serverType: ServerType
  name: string
  appLoc: string
  serverUrl: string
  existingTarget: TargetJson
}
