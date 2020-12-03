import path from 'path'

// process.projectDir sets in cli.js
module.exports = {
  get: function () {
    const buildSourceFolder = path.join(process.projectDir, 'sasjs')
    const buildSourceDBFolder = path.join(process.projectDir, 'sasjs', 'db')
    const buildDestinationFolder = path.join(process.projectDir, 'sasjsbuild')
    const buildDestinationServ = path.join(
      process.projectDir,
      'sasjsbuild',
      'services'
    )
    const buildDestinationJobs = path.join(
      process.projectDir,
      'sasjsbuild',
      'jobs'
    )
    const buildDestinationDBFolder = path.join(
      process.projectDir,
      'sasjsbuild',
      'db'
    )
    return {
      buildSourceFolder,
      buildSourceDBFolder,
      buildDestinationFolder,
      buildDestinationServ,
      buildDestinationJobs,
      buildDestinationDBFolder
    }
  }
}
