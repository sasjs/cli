import path from 'path'
import dotenv from 'dotenv'
import { fileExists } from '@sasjs/utils/file'

export async function loadProjectEnvVariables() {
  await loadEnvVariables('.env')
}

export async function loadTargetEnvVariables(targetName: string) {
  await loadEnvVariables(`.env.${targetName}`)
}

async function loadEnvVariables(fileName: string) {
  const envFileExistsInCurrentPath = await fileExists(
    path.join(process.cwd(), fileName)
  )
  const envFileExistsInParentPath = await fileExists(
    path.join(process.cwd(), '..', fileName)
  )
  const envFilePath = envFileExistsInCurrentPath
    ? path.join(process.cwd(), fileName)
    : envFileExistsInParentPath
    ? path.join(process.cwd(), '..', fileName)
    : null
  if (envFilePath) {
    dotenv.config({ path: envFilePath })
  }
}
