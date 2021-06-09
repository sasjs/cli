import path from 'path'
import { createFile, createFolder, listFilesInFolder } from '@sasjs/utils'
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
  return path.extname(filePath) === '.sh'
}

export const sanitizeFileName = (fileName) =>
  fileName.replace(/[^a-z0-9]/gi, '_')

/**
 * Gets a list of @li items from the supplied file content with the specified header.
 * @param {string} listHeader - the header of the section to look for - e.g. <h4> Dependencies </h4>.
 * @param {string} fileContent - the text content of the file.
 */
export function getList(listHeader, fileContent) {
  let fileHeader
  try {
    const hasFileHeader = fileContent.split('/**')[0] !== fileContent
    if (!hasFileHeader) return []
    fileHeader = fileContent.split('/**')[1].split('**/')[0]
  } catch (e) {
    process.logger?.error(
      'File header parse error.\nPlease make sure your file header is in the correct format.'
    )
  }

  const list = []

  const lines = fileHeader.split('\n').map((s) => (s ? s.trim() : s))
  let startIndex = null
  let endIndex = null
  for (let i = 0; i < lines.length; i++) {
    if (new RegExp(listHeader, 'i').test(lines[i])) {
      startIndex = i + 1
      break
    }
  }

  for (let i = startIndex; i < lines.length; i++) {
    if (!lines[i]) {
      endIndex = i
      break
    }
  }

  for (let i = startIndex; i < endIndex; i++) {
    list.push(lines[i])
  }

  return list
    .filter((l) => l.startsWith('@li'))
    .map((d) => d.replace(/\@li/g, ''))
    .map((d) => d.trim())
}
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

export async function saveToDefaultLocation(filePath, data) {
  const root = await getProjectRoot()

  const destination = path.join(root, 'sasjsbuild', filePath)

  getRelativePath(process.cwd(), destination)

  const relativePath = getRelativePath(process.cwd(), destination)

  await createFile(destination, data)

  return Promise.resolve({
    absolutePath: destination,
    relativePath: `${relativePath}`
  })
}

export const sasFileRegExp = /.sas$/i
