import SASjs from '@sasjs/adapter/node'
import { create } from '../src/commands/folder/create'
import { remove } from '../src/commands/folder/remove'

global.addAppLocOnServer = async (config) => {
  const adapter = new SASjs({
    appLoc: config.appLoc,
    serverUrl: config.serverUrl,
    serverType: config.serverType,
    useComputeApi: config.useComputeApi
  })

  await create(config.appLoc, adapter, process.env.ACCESS_TOKEN)
}

global.removeAppLocOnServer = async (config) => {
  const adapter = new SASjs({
    appLoc: config.appLoc,
    serverUrl: config.serverUrl,
    serverType: config.serverType,
    useComputeApi: config.useComputeApi
  })

  await remove(config.appLoc, adapter, process.env.ACCESS_TOKEN)
}
