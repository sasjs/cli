import path from 'path'
import {
  readFile,
  getSubFoldersInFolder,
  getFilesInFolder,
  getIniFilesInFolder,
  createFile,
  createFolder,
  deleteFolder,
  fileExists
} from '../../utils/file'
import { asyncForEach } from '../../utils/utils'
import { getConstants } from '../../constants'

const whiteListedDBExtensions = ['ddl', 'sas']

export async function buildDB() {
  const { buildSourceDbFolder, buildDestinationDbFolder } = getConstants()
  await recreateBuildFolder()

  const buildDBFolders = await getSubFoldersInFolder(buildSourceDbFolder)
  const buildDBIniFiles = await getIniFilesInFolder(buildSourceDbFolder)

  let iniFilesContent: { [key: string]: string } = {}
  await asyncForEach(buildDBIniFiles, async (buildDBIniFile) => {
    iniFilesContent[buildDBIniFile] = await readFile(
      path.join(buildSourceDbFolder, buildDBIniFile)
    )
  })
  await asyncForEach(buildDBFolders, async (buildDBFolder) => {
    process.logger?.info(`Loading DB: ${buildDBFolder}`)

    const folderPath = path.join(buildSourceDbFolder, buildDBFolder)
    const filesNamesInPath = await getFilesInFolder(folderPath)
    const fileExtsInPath = await getFileExts(filesNamesInPath)

    await asyncForEach(fileExtsInPath, async (fileExt) => {
      const destinationFileName = buildDBFolder + '.' + fileExt
      const destinationFilePath = path.join(
        buildDestinationDbFolder,
        destinationFileName
      )
      const filesNamesInPathWithExt = filesNamesInPath.filter(
        (fileName: string) => fileName.endsWith(fileExt)
      )
      let newDbFileContent = ''
      if (fileExt == 'ddl' && iniFilesContent[`${buildDBFolder}.ini`]) {
        newDbFileContent = iniFilesContent[`${buildDBFolder}.ini`]
      }
      await asyncForEach(filesNamesInPathWithExt, async (fileName) => {
        const fileContent = await readFile(path.join(folderPath, fileName))
        newDbFileContent += `\n\n${fileContent}`
      })

      process.logger?.info(`Creating file ${destinationFilePath}.`)
      await createFile(destinationFilePath, newDbFileContent)
      process.logger?.success(`File ${destinationFilePath} has been created.`)
    })
  })
}

async function recreateBuildFolder() {
  const { buildDestinationFolder, buildDestinationDbFolder } = getConstants()
  process.logger?.info(`Recreating folder ${buildDestinationDbFolder}...`)
  const pathExists = await fileExists(buildDestinationFolder)
  if (pathExists) await deleteFolder(buildDestinationDbFolder)
  else await createFolder(buildDestinationFolder)
  await createFolder(buildDestinationDbFolder)
  process.logger?.success(
    `Folder ${buildDestinationDbFolder} has been created.`
  )
}

function getFileExts(fileNames: string[]) {
  let extensions: string[] = []
  fileNames.forEach((fileName) => {
    const ext = fileName.split('.').pop() || ''
    if (whiteListedDBExtensions.includes(ext) && !extensions.includes(ext))
      extensions.push(ext)
  })
  return extensions
}
