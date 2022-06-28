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
  readFile,
  ServerType,
  StreamConfig,
  Target
} from '@sasjs/utils'
import uniqBy from 'lodash.uniqby'
import { getWebServiceContent } from './getWebServiceContent'

export interface AssetPathMap {
  source: string
  target: string
}

/**
 * Creates all the asset services for web streaming.
 * Also prepares an asset-path Map based on server type.
 * @param {Target} target- the target to create asset service.
 * @param {string} destinationPath- the location of web streaming files.
 * @param {StreamConfig} streamConfig- stream configuration to be used.
 * @returns {AssetPathMap[]} list of all the sources specified along server based paths.
 */
export const createAssetServices = async (
  target: Target,
  destinationPath: string,
  { webSourcePath, streamWebFolder, assetPaths }: StreamConfig
): Promise<AssetPathMap[]> => {
  const assetPathMap: AssetPathMap[] = []

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

/**
 * Creates all the asset services for web streaming for a specific folder.
 * Also prepares an asset-path Map based on server type.
 * @param {Target} target- the target to create asset service.
 * @param {string} streamWebFolder- the location of web streaming files.
 * @param {string} fullAssetPath- path of the specific folder used to create all services for.
 * @param {string} destinationPath- path of the destination folder for services.
 * @returns {AssetPathMap[]} list of all the sources specified along server based paths.
 */
const createAssetsServicesNested = async (
  target: Target,
  streamWebFolder: string,
  fullAssetPath: string,
  destinationPath: string
): Promise<AssetPathMap[]> => {
  const assetPathMap: AssetPathMap[] = []
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

    const assetFolderMap: AssetPathMap[] = await createAssetsServicesNested(
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
  const { sas9GUID } = process.sasjsConstants
  const storedProcessPath =
    // the appLoc is inserted dynamically by SAS
    // using three forward slashes as a marker
    // for SAS 9 fileName is a program, with replacement in sasjsout.ts
    // for Viya, fileName is a FILE, with replacement in build.sas only
    serverType === ServerType.SasViya
      ? `/SASJobExecution?_FILE=${appLoc}/services/${streamWebFolder}`
      : `/SASStoredProcess/?_PROGRAM=${sas9GUID}${streamWebFolder}`
  return `${storedProcessPath}/${fileName}`
}
