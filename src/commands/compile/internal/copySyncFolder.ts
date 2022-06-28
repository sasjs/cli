import { copy, folderExists, getAbsolutePath } from '@sasjs/utils'

export const copySyncFolder = async (syncFolder: string) => {
  const { buildSourceFolder, buildDestinationFolder } = process.sasjsConstants
  const syncFolderPath = getAbsolutePath(syncFolder, buildSourceFolder)

  process.logger?.info(`Syncing files from ${syncFolderPath} .`)

  if (!(await folderExists(syncFolderPath))) {
    process.logger?.error(`${syncFolderPath} doesn't exist.`)
    return
  }
  await copy(syncFolderPath, buildDestinationFolder)
}
