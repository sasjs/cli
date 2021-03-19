import path from 'path'
import { Target } from '@sasjs/utils'
import { getConstants } from '../../../constants'
import { getAllJobFolders } from './getAllJobFolders'
import { getAllServiceFolders } from './getAllServiceFolders'

export const identifySasFile = async (
  target: Target,
  sourcePath: string
): Promise<'job' | 'service'> => {
  const { buildSourceFolder } = await getConstants()

  const serviceFolders = (
    await getAllServiceFolders(target)
  ).map((serviceFolder: string) =>
    path.isAbsolute(serviceFolder)
      ? serviceFolder
      : path.join(buildSourceFolder, serviceFolder)
  )

  const isService = serviceFolders.find((folder) => sourcePath.includes(folder))
  if (isService) return 'service'

  const jobFolders = (await getAllJobFolders(target)).map((jobFolder: string) =>
    path.isAbsolute(jobFolder)
      ? jobFolder
      : path.join(buildSourceFolder, jobFolder)
  )

  const isJob = jobFolders.find((folder) => sourcePath.includes(folder))
  if (isJob) return 'job'

  throw 'Unable to identify file as Service or Job'
}
