import fs from 'fs'
import fsExtra from 'fs-extra'
import rimraf from 'rimraf'
import path from 'path'
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

export async function fileExists(filePath) {
  return new Promise((resolve, _) => {
    fs.exists(filePath, (exists) => resolve(exists))
  })
}

export async function folderExists(folderPath) {
  return new Promise((resolve, _) => {
    fs.exists(folderPath, (exists) => resolve(exists))
  })
}

export async function readFile(fileName) {
  process.logger?.debug('Reading file: ', fileName)
  return new Promise((resolve, reject) => {
    fs.readFile(fileName, 'utf8', function (error, data) {
      if (error) {
        process.logger?.error(`Error accessing file: ${fileName}`)
        return reject(error)
      }
      return resolve(data)
    })
  })
}

export async function base64EncodeFile(fileName) {
  process.logger?.debug('Encoding file: ', fileName)
  return new Promise((resolve, reject) => {
    fs.readFile(fileName, { encoding: 'base64' }, function (error, data) {
      if (error) {
        process.logger?.error(`Error accessing file: ${fileName}`)
        return reject(error)
      }
      return resolve(data)
    })
  })
}

export async function getSubFoldersInFolder(folderName) {
  process.logger?.debug(`Getting subfolders in ${folderName}`)
  return new Promise((resolve, reject) => {
    fs.readdir(folderName, { withFileTypes: true }, function (error, data) {
      if (error) {
        process.logger?.error(`Error listing subfolders in: ${folderName}`)
        return reject(error)
      }
      const subFolders = data.filter((d) => d.isDirectory()).map((d) => d.name)
      return resolve(subFolders)
    })
  })
}

export async function getFilesInFolder(folderName) {
  process.logger?.debug(`Getting files in ${folderName}`)
  return new Promise((resolve, reject) => {
    fs.readdir(folderName, { withFileTypes: true }, function (error, data) {
      if (error) {
        process.logger?.error(`Error listing files in: ${folderName}`)
        return reject(error)
      }
      const files = data.filter((d) => !d.isDirectory()).map((d) => d.name)
      return resolve(files)
    })
  })
}

export async function getIniFilesInFolder(folderName) {
  process.logger?.debug(`Getting *.ini files in ${folderName}`)
  return new Promise((resolve, reject) => {
    fs.readdir(folderName, { withFileTypes: true }, function (error, data) {
      if (error) {
        process.logger?.error(`Error listing *.ini files in: ${folderName}`)
        return reject(error)
      }
      const files = data
        .filter((d) => !d.isDirectory())
        .map((d) => d.name)
        .filter((name) => name.endsWith('.ini'))
      return resolve(files)
    })
  })
}

export async function createFolder(folderName) {
  process.logger?.debug(`Creating folder ${folderName}`)
  return new Promise((resolve, reject) => {
    fs.mkdir(folderName, { recursive: true }, (error, data) => {
      if (error) {
        process.logger?.error(`Error creating folder ${folderName}`)

        return reject(error)
      }

      resolve(data)
    })
  })
}

export async function createFile(fileName, content) {
  process.logger?.debug(`Creating file ${fileName}`)

  return new Promise(async (resolve, reject) => {
    fileName = unifyFilePath(fileName)

    if (fileName.split(path.sep).length > 1) {
      let folderPath = fileName.split(path.sep)
      folderPath.pop()
      folderPath = folderPath.join(path.sep)

      if (!(await folderExists(folderPath))) await createFolder(folderPath)
    }

    fs.writeFile(fileName, content, function (error) {
      if (error) {
        process.logger?.error(`Error creating file ${fileName}`)
        return reject(error)
      }

      resolve(content)
    })
  })
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

export async function deleteFolder(folderName) {
  process.logger?.debug(`Deleting folder ${folderName}`)

  return new Promise((resolve, reject) => {
    rimraf(folderName, function (error) {
      if (error) {
        process.logger?.error(`Error deleting folder ${folderName}`)

        return reject(error)
      }
      return resolve()
    })
  })
}

export async function deleteFile(filePath) {
  process.logger?.debug(`Deleting file ${filePath}`)

  return new Promise((resolve, reject) => {
    rimraf(filePath, function (error) {
      if (error) {
        process.logger?.error(`Error deleting file ${filePath}`)

        return reject(error)
      }
      return resolve()
    })
  })
}

export async function copy(source, destination) {
  process.logger?.debug(`Copying ${source} to ${destination}`)

  return new Promise((resolve, reject) => {
    fsExtra.copy(source, destination, function (error) {
      if (error) {
        process.logger?.error(`Error copying ${source} to ${destination}`)
        return reject(error)
      }
      return resolve()
    })
  })
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

export function getRealPath(file) {
  return fs.realpathSync(file)
}
