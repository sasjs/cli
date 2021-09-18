import path from 'path'
import {
  asyncForEach,
  base64EncodeFile,
  copy,
  createFile,
  createFolder,
  folderExists,
  listFilesInFolder,
  listSubFoldersInFolder,
  ServerType,
  StreamConfig,
  Target
} from '@sasjs/utils'
import uniqBy from 'lodash.uniqby'
import { getWebServiceContent } from './getWebServiceContent'

export const createAssetServices = async (
  target: Target,
  destinationPath: string,
  streamConfig: StreamConfig
): Promise<{ source: string; target: string }[]> => {
  const { webSourcePath, streamWebFolder, assetPaths } = streamConfig
  const assetPathMap: { source: string; target: string }[] = []

  await asyncForEach(
    [path.join(process.projectDir, webSourcePath), ...(assetPaths ?? [])],
    async (assetPath) => {
      const fullAssetPath = path.isAbsolute(assetPath)
        ? assetPath
        : path.isAbsolute(webSourcePath)
        ? path.join(webSourcePath, assetPath)
        : path.join(process.projectDir, webSourcePath, assetPath)
      const assetPathExists = await folderExists(fullAssetPath)

      if (!assetPathExists) {
        process.logger?.warn(
          `Assets path '${fullAssetPath}' present in 'streamConfig' doesn't exist.`
        )
        return
      }
      const assetPathMapNested = await createAssetsServicesNested(
        target,
        streamWebFolder,
        fullAssetPath,
        destinationPath
      )
      assetPathMap.push(...assetPathMapNested)
    }
  )
  return uniqBy(assetPathMap, 'source')
}

const createAssetsServicesNested = async (
  target: Target,
  streamWebFolder: string,
  fullAssetPath: string,
  destinationPath: string
) => {
  const assetPathMap: { source: string; target: string }[] = []
  const filePaths = await listFilesInFolder(fullAssetPath)
  await asyncForEach(filePaths, async (filePath) => {
    const fullFileName = path.basename(filePath)
    const fileName = fullFileName.substring(0, fullFileName.lastIndexOf('.'))
    const fileExtension = path
      .basename(filePath)
      .substring(fullFileName.lastIndexOf('.') + 1, fullFileName.length)
    if (fileName && fileExtension) {
      const sourcePath = path.join(fullAssetPath, filePath)
      if (target.serverType === ServerType.SasViya) {
        await copy(sourcePath, path.join(destinationPath, fullFileName))
        const assetServiceUrl = getAssetPath(
          target.appLoc,
          target.serverType,
          streamWebFolder,
          fullFileName
        )
        assetPathMap.push({
          source: fullFileName,
          target: assetServiceUrl
        })
      } else {
        const fileName = await generateAssetService(
          sourcePath,
          filePath,
          destinationPath,
          target.serverType
        )
        const assetServiceUrl = getAssetPath(
          target.appLoc,
          target.serverType,
          streamWebFolder,
          fileName.replace('.sas', '')
        )
        assetPathMap.push({
          source: fullFileName,
          target: assetServiceUrl
        })
      }
    }
  })

  const folderNames = await listSubFoldersInFolder(fullAssetPath)
  await asyncForEach(folderNames, async (folderName) => {
    const destinationPathNested = path.join(destinationPath, folderName)
    const fullAssetPathNested = path.join(fullAssetPath, folderName)

    await createFolder(destinationPathNested)

    const assetFolderMap: { source: string; target: string }[] =
      await createAssetsServicesNested(
        target,
        `${streamWebFolder}/${folderName}`,
        fullAssetPathNested,
        destinationPathNested
      )
    assetFolderMap.forEach((entry) => {
      assetPathMap.push({
        source: `${folderName}/${entry.source}`,
        target: entry.target
      })
    })
  })
  return assetPathMap
}

const generateAssetService = async (
  sourcePath: string,
  filePath: string,
  destinationPath: string,
  serverType: ServerType
) => {
  const fileExtension = path.extname(filePath)
  const fileType = fileExtension.replace('.', '').toUpperCase()
  const fileName = path
    .basename(filePath)
    .replace(new RegExp(fileExtension + '$'), fileExtension.replace('.', '-'))
  const base64string = await base64EncodeFile(sourcePath)

  const serviceContent = await getWebServiceContent(
    base64string,
    fileType,
    serverType
  )

  await createFile(
    path.join(destinationPath, `${fileName}.sas`),
    serviceContent
  )

  return `${fileName}.sas`
}

const getAssetPath = (
  appLoc: string,
  serverType: ServerType,
  streamWebFolder: string,
  fileName: string
) => {
  const storedProcessPath =
    // the appLoc is inserted dynamically by SAS
    // using three forward slashes as a marker
    // for SAS 9 fileName is a program, with replacement in sasjsout.ts
    // for Viya, fileName is a FILE, with replacement in build.sas only
    serverType === ServerType.SasViya
      ? `/SASJobExecution?_FILE=${appLoc}/services/${streamWebFolder}`
      : `/SASStoredProcess/?_PROGRAM=///${streamWebFolder}`
  return `${storedProcessPath}/${fileName}`
}
