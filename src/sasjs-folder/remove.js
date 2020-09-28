import { displayResult } from '../utils/displayResult'

export const remove = async (path, sasjs, accessToken) => {
  const deletedFolder = await sasjs
    .deleteFolder(path, accessToken)
    .catch((err) => {
      displayResult(err)
    })

  if (deletedFolder) {
    displayResult(
      null,
      null,
      `Folder '${path}' has been moved to 'Recycle Bin'.`
    )
  }
}
