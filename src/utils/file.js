import path from 'path'
import { createFile, createFolder } from '@sasjs/utils'
import { getProjectRoot } from './config'

export async function createFolderStructure(folder, parentFolderName = '.') {
  let folderPath = path.join(process.projectDir, folder.folderName)
  if (parentFolderName) {
    folderPath = path.join(
      process.projectDir,
      parentFolderName,
      folder.folderName
    )
  }
  await createFolder(folderPath).catch(() =>
    process.logger?.error('Error creating folder: ', folder.folderName)
  )
  if (folder.files && folder.files.length) {
    folder.files.forEach(async (file) => {
      const filePath = path.join(
        process.projectDir,
        parentFolderName,
        `${folder.folderName}/${file.fileName}`
      )
      await createFile(filePath, file.content).catch(() => {
        process.logger?.error('Error creating file: ', filePath)
      })
    })
  }
  if (folder.subFolders && folder.subFolders.length) {
    folder.subFolders.forEach(async (subFolder) => {
      subFolder.folderName = `${
        parentFolderName ? parentFolderName + '/' : ''
      }${folder.folderName}/${subFolder.folderName}`
      await createFolderStructure(subFolder)
    })
  }
}

export function unifyFilePath(filePath, separator = path.sep, replace = '/') {
  const separators = { unix: '/', win: '\\' }

  let osSeparator = Object.keys(separators).find(
    (key) => separators[key] === separator
  )

  if (osSeparator) {
    const notValidSeparator =
      separators[Object.keys(separators).find((key) => key !== osSeparator)]

    osSeparator = separators[osSeparator]

    return filePath.split(notValidSeparator).join(osSeparator)
  }

  return filePath.split(replace).join(separator)
}

export function isSasFile(filePath) {
  return path.extname(filePath) === '.sas'
}

export function isJsonFile(filePath) {
  return path.extname(filePath) === '.json'
}

export function isCsvFile(filePath) {
  return path.extname(filePath) === '.csv'
}

export function isShellScript(filePath) {
  return path.extname(filePath) === '.sh' || path.extname(filePath) === '.bat'
}

export function isPowerShellScript(filePath) {
  return path.extname(filePath) === '.ps1'
}

export const sanitizeFileName = (fileName) =>
  fileName.replace(/[^a-z0-9]/gi, '_')

export function getBrief(fileContent) {
  let fileHeader
  try {
    const hasFileHeader = fileContent.split('/**')[0] !== fileContent
    if (!hasFileHeader) return []
    fileHeader = fileContent.split('/**')[1].split('**/')[0]
  } catch (e) {
    console.error(
      chalk.redBright(
        'File header parse error.\nPlease make sure your file header is in the correct format.'
      )
    )
  }

  const lines = fileHeader.split('\n').map((s) => (s ? s.trim() : s))

  let brief = lines.find((l) => l.startsWith('@brief'))
  if (brief) brief = brief.replace(/\@brief/g, '').trim()
  return brief
}

export function getRelativePath(from, to) {
  const fromFolders = from.split(path.sep)
  const toFolders = to.split(path.sep)

  let similarPath = []
  let relativePath = []

  fromFolders.forEach((fromFolder, i) => {
    if (toFolders[i] !== undefined && fromFolders[i] === toFolders[i]) {
      similarPath.push(fromFolder)
    } else {
      if (fromFolder) relativePath.push(fromFolder)
    }
  })

  similarPath = similarPath.join(path.sep)

  const leadingPathSepRegExp = new RegExp(`^${path.sep.replace(/\\/g, '\\\\')}`)
  const trailingPathSepRegExp = new RegExp(
    `${path.sep.replace(/\\/g, '\\\\')}$`
  )

  relativePath =
    (!path.sep.match(/\\/)
      ? relativePath.length
        ? `..${path.sep}`.repeat(relativePath.length)
        : `.${path.sep}`
      : '') +
    to
      .replace(similarPath, '')
      .replace(leadingPathSepRegExp, '')
      .replace(trailingPathSepRegExp, '')

  return relativePath
}

export const sasFileRegExp = /.sas$/i
