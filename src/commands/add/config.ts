import { create } from '../create'
import path from 'path'
import { getConfiguration } from '../../utils/config-utils'

export async function getLocalConfig() {
  const buildSourceFolder = require('../../constants').get().buildSourceFolder
  const config = await getConfiguration(
    path.join(buildSourceFolder, 'sasjsconfig.json')
  )
  if (!config) await create('.', 'sasonly')
  return config
}
