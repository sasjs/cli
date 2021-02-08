import { setupDoxygen } from '../../utils/utils'

/**
 * Initiates or reset doxy folder in current sasjs application
 */
export async function initDocs() {
  const parentFolderName = '.'
  await setupDoxygen(parentFolderName)
}
