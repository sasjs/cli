import { copy, folderExists, getAbsolutePath } from '@sasjs/utils'

export const copySyncFolder = async (syncFolder: string) => {
  const { buildSourceFolder, buildDestinationFolder } = process.sasjsConstants
  const mocksFolder = getAbsolutePath(syncFolder, buildSourceFolder)

  process.logger?.info(`Syncing files from ${mocksFolder} .`)

  if (!(await folderExists(mocksFolder))) {
    process.logger?.error(`${mocksFolder} doesn't exist.`)
    return
  }
  await copy(mocksFolder, buildDestinationFolder)
}
