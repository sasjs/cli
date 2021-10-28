import { Target } from '@sasjs/utils'
import { TargetScope } from '../../../types'
import { saveToGlobalConfig, saveToLocalConfig } from '../../../utils'

export async function saveConfig(
  scope: TargetScope,
  target: Target,
  isDefault: boolean,
  saveWithDefaultValues: boolean
) {
  let filePath = ''

  if (scope === TargetScope.Local) {
    filePath = await saveToLocalConfig(target, isDefault, saveWithDefaultValues)
  } else if (scope === TargetScope.Global) {
    filePath = await saveToGlobalConfig(
      target,
      isDefault,
      saveWithDefaultValues
    )
  }

  return filePath
}
