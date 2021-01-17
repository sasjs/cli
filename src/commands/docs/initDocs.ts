import { setupDoxygen } from '../../utils/utils'

export async function initDocs() {
  const parentFolderName = '.'
  await setupDoxygen(parentFolderName)
}
