import { ServerType, TargetJson } from '@sasjs/utils/types'
import { TargetScope } from './targetScope'

export interface CommonFields {
  scope: TargetScope
  serverType: ServerType
  name: string
  appLoc: string
  serverUrl: string
  existingTarget: TargetJson
}
