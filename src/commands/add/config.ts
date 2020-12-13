import { create } from '../create'
import path from 'path'
import { Target } from '@sasjs/utils/types'
import { createFile } from '../../utils/file'
import { getConfiguration } from '../../utils/config-utils'

export async function getLocalConfig() {
  const buildSourceFolder = require('../../constants').get().buildSourceFolder
  const config = await getConfiguration(
    path.join(buildSourceFolder, 'sasjsconfig.json')
  )
  if (!config) await create('.', 'sasonly')
  return config
}

export async function saveToLocalConfig(buildTarget: Target) {
  const buildSourceFolder = require('../../constants').get().buildSourceFolder
  let config = await getLocalConfig()
  if (config) {
    if (config.targets && config.targets.length) {
      const existingTargetIndex = config.targets.findIndex(
        (t: Target) => t.name === buildTarget.name
      )
      if (existingTargetIndex > -1) {
        config.targets[existingTargetIndex] = buildTarget
      } else {
        config.targets.push(buildTarget)
      }
    } else {
      config.targets = [buildTarget]
    }
  } else {
    config = { targets: [buildTarget] }
  }

  const configPath = path.join(buildSourceFolder, 'sasjsconfig.json')

  await createFile(configPath, JSON.stringify(config, null, 2))

  return configPath
}
