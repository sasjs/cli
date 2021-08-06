import path from 'path'
import {
  AuthConfig,
  createFile,
  createFolder,
  fileExists,
  folderExists,
  readFile,
  Target
} from '@sasjs/utils'
import { getConstants } from '../../../constants'
import { Flow } from '../../../types'
import { getAuthConfig } from '../../../utils/config'
import { displayError } from '../../../utils/displayResult'
import { isCsvFile, isJsonFile } from '../../../utils/file'
import examples from '../examples'

export const validateParams = async (
  source: string,
  csvFile: string,
  logFolder: string,
  target: Target
): Promise<{
  terminate: boolean
  message?: string
  flows?: any
  authConfig?: AuthConfig
  csvFile?: string
}> => {
  const { buildDestinationFolder } = await getConstants()

  if (!source || !isJsonFile(source)) {
    return {
      terminate: true,
      message: `Please provide flow source (--source) file.\n${examples.command}`
    }
  }

  if (
    !(await fileExists(source).catch((err) =>
      displayError(err, 'Error while checking if source file exists.')
    ))
  ) {
    return {
      terminate: true,
      message: `Source file does not exist.\n${examples.command}`
    }
  }

  const sourceContent = (await readFile(source).catch((err) =>
    displayError(err, 'Error while reading source file.')
  )) as string

  let sourceConfig: Flow

  try {
    sourceConfig = JSON.parse(sourceContent)
  } catch (_) {
    return {
      terminate: true,
      message: `Unable to parse JSON of provided source file.\n${examples.source}`
    }
  }

  let flows = sourceConfig?.flows

  if (!flows)
    return {
      terminate: true,
      message: `There are no flows present in source JSON.\n${examples.source}`
    }

  const authConfig = await getAuthConfig(target).catch((err) => {
    displayError(err, 'Error while getting access token.')
    throw err
  })

  const defaultCsvFileName = 'flowResults.csv'

  if (csvFile) {
    if (csvFile.includes('.')) {
      if (!isCsvFile(csvFile))
        return {
          terminate: true,
          message: `Please provide csv file location (--csvFile).\n${examples.command}`
        }
    } else {
      csvFile = path.join(csvFile, defaultCsvFileName)
    }
  } else {
    csvFile = path.join(buildDestinationFolder, defaultCsvFileName)
  }
  await createFile(csvFile, '').catch((err) =>
    displayError(err, 'Error while creating CSV file.')
  )

  if (!logFolder) {
    logFolder = path.join(buildDestinationFolder, 'logs')
  }
  if (
    !(await folderExists(logFolder).catch((err) =>
      displayError(err, 'Error while checking if log folder exists.')
    ))
  ) {
    await createFolder(logFolder).catch((err) =>
      displayError(err, 'Error while creating log folder file.')
    )
  }
  return {
    terminate: false,
    flows,
    authConfig,
    csvFile
  }
}
