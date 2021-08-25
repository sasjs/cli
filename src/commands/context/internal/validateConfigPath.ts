import { fileExists } from '@sasjs/utils/file'

export async function validateConfigPath(path: string) {
  if (!path) return false

  const isJsonFile = /\.json$/i.test(path)

  if (!isJsonFile) return false

  return await fileExists(path)
}
