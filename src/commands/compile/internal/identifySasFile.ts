import path from 'path'
import { Target } from '@sasjs/utils'
import { getAllJobFolders } from './getAllJobFolders'
import { getAllServiceFolders } from './getAllServiceFolders'

export const identifySasFile = async (
  target: Target,
  sourcePath: string
): Promise<'job' | 'service'> => {
  const serviceFolders = await getAllServiceFolders(target)

  const isService = serviceFolders.find((folder) => sourcePath.includes(folder))
  if (isService) return 'service'

  const jobFolders = await getAllJobFolders(target)

  const isJob = jobFolders.find((folder) => sourcePath.includes(folder))
  if (isJob) return 'job'

  throw 'Unable to identify file as Service or Job'
}
