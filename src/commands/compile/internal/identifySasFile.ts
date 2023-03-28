import { Target } from '@sasjs/utils'
import { getAllFolders, SasFileType } from './'

export const identifySasFile = async (
  target: Target,
  sourcePath: string
): Promise<'job' | 'service'> => {
  const serviceFolders = await getAllFolders(target, SasFileType.Service)

  const isService = serviceFolders.find((folder) => sourcePath.includes(folder))
  if (isService) return 'service'

  const jobFolders = await getAllFolders(target, SasFileType.Job)

  const isJob = jobFolders.find((folder) => sourcePath.includes(folder))
  if (isJob) return 'job'

  throw 'Unable to identify file as Service or Job'
}
