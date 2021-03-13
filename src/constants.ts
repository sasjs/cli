import path from 'path'

interface Constants {
  buildSourceFolder: string
  buildSourceDbFolder: string
  buildDestinationFolder: string
  buildDestinationServicesFolder: string
  buildDestinationJobsFolder: string
  buildDestinationDbFolder: string
  buildDestinationDocsFolder: string
}

// process.projectDir sets in cli.js
export const getConstants = (): Constants => {
  const buildSourceFolder = path.join(process.projectDir)
  const buildSourceDbFolder = path.join(process.projectDir, 'sasjs', 'db')
  const buildDestinationFolder = path.join(process.projectDir, 'sasjsbuild')
  const buildDestinationServicesFolder = path.join(
    process.projectDir,
    'sasjsbuild',
    'services'
  )
  const buildDestinationJobsFolder = path.join(
    process.projectDir,
    'sasjsbuild',
    'jobs'
  )
  const buildDestinationDbFolder = path.join(
    process.projectDir,
    'sasjsbuild',
    'db'
  )
  const buildDestinationDocsFolder = path.join(
    process.projectDir,
    'sasjsbuild',
    'docs'
  )
  return {
    buildSourceFolder,
    buildSourceDbFolder,
    buildDestinationFolder,
    buildDestinationServicesFolder,
    buildDestinationJobsFolder,
    buildDestinationDbFolder,
    buildDestinationDocsFolder
  }
}
