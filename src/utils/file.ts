import path from 'path'
import chalk from 'chalk'
import { createFile, createFolder } from '@sasjs/utils'
import { Folder } from '../types'
import { displayError } from './displayResult'

export async function createFolderStructure(
  folder: Folder,
  parentFolderName = '.'
) {
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
      await createFile(filePath, file.content || '').catch(() => {
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

export function isSasFile(filePath: string) {
  return path.extname(filePath) === '.sas'
}

export function isJsonFile(filePath: string) {
  return path.extname(filePath) === '.json'
}

export function isCsvFile(filePath: string) {
  return path.extname(filePath) === '.csv'
}

export function isShellScript(filePath: string) {
  return path.extname(filePath) === '.sh' || path.extname(filePath) === '.bat'
}

export function isPowerShellScript(filePath: string) {
  return path.extname(filePath) === '.ps1'
}

export const sanitizeFileName = (fileName: string) =>
  fileName.replace(/[^a-z0-9]/gi, '_')

export function getBrief(fileContent: string) {
  try {
    const hasFileHeader = fileContent.split('/**')[0] !== fileContent
    if (!hasFileHeader) return

    const fileHeader = fileContent.split('/**')[1].split('**/')[0]

    const lines = fileHeader.split('\n').map((s) => (s ? s.trim() : s))

    const brief = lines.find((l) => l.startsWith('@brief'))

    if (brief) return brief.replace(/\@brief/g, '').trim()
  } catch (e) {
    displayError(
      e,
      chalk.redBright(
        'File header parse error.\nPlease make sure your file header is in the correct format.'
      )
    )
  }
}

export const sasFileRegExp = /.sas$/i
