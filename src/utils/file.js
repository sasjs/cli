import chalk from 'chalk'
import fs from 'fs'
import fsExtra from 'fs-extra'
import rimraf from 'rimraf'
import path from 'path'

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
    console.log(
      chalk.redBright(
        'Error creating folder: ',
        chalk.redBright.bold(folder.folderName)
      )
    )
  )
  if (folder.files && folder.files.length) {
    folder.files.forEach(async (file) => {
      const filePath = path.join(
        process.projectDir,
        parentFolderName,
        `${folder.folderName}/${file.fileName}`
      )
      await createFile(filePath, file.content).catch(() => {
        console.log(
          chalk.redBright(
            'Error creating file: ',
            chalk.redBright.bold(filePath)
          )
        )
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

export async function readFile(fileName, debug = false, silent = false) {
  if (debug) {
    console.log('Reading file: ', chalk.cyan(fileName))
  }
  return new Promise((resolve, reject) => {
    fs.readFile(fileName, 'utf8', function (error, data) {
      if (error) {
        if (!silent) {
          console.log(
            chalk.red(`Error accessing file: `),
            chalk.redBright.bold(fileName)
          )
        }
        return reject(error)
      }
      resolve(data)
    })
  })
}

export async function deleteFile(fileName) {
  return new Promise((resolve, reject) => {
    fs.unlink(fileName, (err) => {
      if (err) return reject(err)

      resolve()
    })
  })
}

export async function base64EncodeFile(fileName, debug = false) {
  if (debug) {
    console.log('Encoding file: ', chalk.cyan(fileName))
  }
  return new Promise((resolve, reject) => {
    fs.readFile(fileName, { encoding: 'base64' }, function (error, data) {
      if (error) {
        console.log(
          chalk.red(`Error accessing file: `),
          chalk.redBright.bold(fileName)
        )
        return reject(error)
      }
      resolve(data)
    })
  })
}

export async function getSubFoldersInFolder(folderName, debug = false) {
  if (debug) {
    console.log('Getting subfolders in %s', chalk.cyan(folderName))
  }
  return new Promise((resolve, reject) => {
    fs.readdir(folderName, { withFileTypes: true }, function (error, data) {
      if (error) {
        console.log(
          chalk.red(`Error listing subfolders in %s`),
          chalk.redBright.bold(folderName)
        )
        return reject(error)
      }
      const subFolders = data.filter((d) => d.isDirectory()).map((d) => d.name)
      resolve(subFolders)
    })
  })
}

export async function getFilesInFolder(folderName, debug = false) {
  if (debug) {
    console.log('Getting files in %s', chalk.cyan(folderName))
  }
  return new Promise((resolve, reject) => {
    fs.readdir(folderName, { withFileTypes: true }, function (error, data) {
      if (error) {
        console.log(
          chalk.red(`Error listing subfolders in %s`),
          chalk.redBright.bold(folderName)
        )
        return reject(error)
      }
      const files = data.filter((d) => !d.isDirectory()).map((d) => d.name)
      resolve(files)
    })
  })
}

export async function getIniFilesInFolder(folderName, debug = false) {
  if (debug) {
    console.log('Getting *.ini file in %s', chalk.cyan(folderName))
  }
  return new Promise((resolve, reject) => {
    fs.readdir(folderName, { withFileTypes: true }, function (error, data) {
      if (error) {
        console.log(
          chalk.red(`Error listing subfolders in %s`),
          chalk.redBright.bold(folderName)
        )
        return reject(error)
      }
      const files = data
        .filter((d) => !d.isDirectory())
        .map((d) => d.name)
        .filter((name) => name.endsWith('.ini'))
      resolve(files)
    })
  })
}

export async function createFolder(folderName, debug = false) {
  if (debug) console.log('Creating folder %s', chalk.cyan(folderName))

  return new Promise((resolve, reject) => {
    fs.mkdir(folderName, { recursive: true }, (error, data) => {
      if (error) {
        console.log(
          chalk.red(`Error creating folder %s`),
          chalk.redBright.bold(folderName)
        )

        return reject(error)
      }

      resolve(data)
    })
  })
}

export async function createFile(fileName, content, debug = false) {
  if (debug) {
    console.log('Creating file %s', chalk.cyan(fileName))
  }

  return new Promise(async (resolve, reject) => {
    if (fileName.split(path.sep).length > 1) {
      let folderPath = fileName.split(path.sep)
      folderPath.pop()
      folderPath = folderPath.join(path.sep)

      if (!(await folderExists(folderPath))) await createFolder(folderPath)
    }

    fs.writeFile(fileName, content, function (error, data) {
      if (error) {
        console.log(
          chalk.red(`Error creating file %s`),
          chalk.redBright.bold(fileName)
        )
        return reject(error)
      }
      resolve(data)
    })
  })
}

export async function deleteFolder(folderName, debug = false) {
  if (debug) {
    console.log('Deleting folder %s', chalk.cyan(folderName))
  }
  return new Promise((resolve, reject) => {
    rimraf(folderName, function (error) {
      if (error) {
        console.log(
          chalk.red(`Error deleting folder %s`),
          chalk.redBright.bold(folderName)
        )
        reject(error)
      }
      resolve()
    })
  })
}

export async function deleteFile(filePath, debug = false) {
  if (debug) {
    console.log('Deleting file %s', chalk.cyan(filePath))
  }
  return new Promise((resolve, reject) => {
    rimraf(filePath, function (error) {
      if (error) {
        console.log(
          chalk.red(`Error deleting file %s`),
          chalk.redBright.bold(filePath)
        )
        reject(error)
      }
      resolve()
    })
  })
}

export async function copy(source, destination, debug = false) {
  if (debug) {
    console.log('Copying %s to %s', chalk.cyan(source), chalk.cyan(destination))
  }
  return new Promise((resolve, reject) => {
    fsExtra.copy(source, destination, function (error) {
      if (error) {
        console.log(
          chalk.red(`Error copying files`),
          chalk.redBright.bold(source, destination)
        )
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
    console.error(
      chalk.redBright(
        'File header parse error.\nPlease make sure your file header is in the correct format.'
      )
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
