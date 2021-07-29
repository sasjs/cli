import path from 'path'
import { displayError } from '../../utils/displayResult'
import { isJsonFile, isCsvFile, saveToDefaultLocation } from '../../utils/file'
import { getAuthConfig } from '../../utils/config'
import {
  Target,
  fileExists,
  readFile,
  createFile,
  folderExists,
  createFolder,
  getRealPath
} from '@sasjs/utils'
import SASjs, { PollOptions } from '@sasjs/adapter/node'
import examples from './examples'
import { FilePath, Flow } from '../../types'
import { executeFlow } from './internal/executeFlow'
import { failAllSuccessors } from './internal/failAllSuccessors'
import { saveToCsv } from './internal/saveToCsv'
import { isFlowExecuted } from './internal/isFlowExecuted'

export async function execute(
  source: string,
  logFolder: string,
  csvFile: string,
  target: Target,
  streamLog: boolean,
  sasjs: SASjs
) {
  return new Promise(async (resolve, reject) => {
    const pollOptions: PollOptions = {
      maxPollCount: 24 * 60 * 60,
      pollInterval: 1000,
      streamLog,
      logFolderPath: logFolder
    }

    let defaultCsvLoc: FilePath

    const logger = process.logger

    if (!source || !isJsonFile(source)) {
      return reject(
        `Please provide flow source (--source) file.\n${examples.command}`
      )
    }

    if (
      !(await fileExists(source).catch((err) =>
        displayError(err, 'Error while checking if source file exists.')
      ))
    ) {
      return reject(`Source file does not exist.\n${examples.command}`)
    }

    const sourceContent = (await readFile(source).catch((err) =>
      displayError(err, 'Error while reading source file.')
    )) as string

    let sourceConfig: Flow

    try {
      sourceConfig = JSON.parse(sourceContent)
    } catch (_) {
      return reject(examples.source)
    }

    let flows = sourceConfig?.flows

    if (!flows) return reject(examples.source)

    const authConfig = await getAuthConfig(target).catch((err) => {
      displayError(err, 'Error while getting access token.')
      throw err
    })

    const defaultCsvFileName = 'flowResults.csv'

    if (csvFile) {
      if (csvFile.includes('.')) {
        if (!isCsvFile(csvFile)) {
          return reject(
            `Please provide csv file location (--csvFile).\n${examples.command}`
          )
        }
      } else {
        csvFile = path.join(csvFile, defaultCsvFileName)
      }

      await createFile(csvFile, '').catch((err) =>
        displayError(err, 'Error while creating CSV file.')
      )
    } else {
      defaultCsvLoc = await saveToDefaultLocation(defaultCsvFileName, '')

      csvFile = defaultCsvLoc.relativePath
    }

    if (
      logFolder &&
      !(await folderExists(logFolder).catch((err) =>
        displayError(err, 'Error while checking if log folder exists.')
      ))
    ) {
      await createFolder(logFolder).catch((err) =>
        displayError(err, 'Error while creating log folder file.')
      )
    }

    const contextName = target.contextName

    logger?.info(
      `Executing flow for '${target.name}' target with app location '${target.appLoc}':`
    )

    let csvFileAbleToSave = true

    const preExecuteFlow = async (flowName: string) => {
      const flow = flows[flowName]

      if (!flow.jobs || !Array.isArray(flow.jobs))
        return reject(examples.source)

      if (isFlowExecuted(flow)) return
      flow.predecessors?.forEach(async (predecessorName) => {
        if (!Object.keys(flows).includes(predecessorName))
          displayError(
            {},
            `Predecessor '${predecessorName}' mentioned in '${flowName}' flow does not exist.`
          )
        else if (predecessorName === flowName)
          displayError(
            {},
            `Predecessor '${predecessorName}' mentioned in '${flowName}' cannot point to itself.`
          )
        else if (!isFlowExecuted(flows[predecessorName]))
          await preExecuteFlow(predecessorName)
      })

      const { jobStatus, flowStatus } = await executeFlow(
        flow,
        sasjs,
        pollOptions,
        target,
        authConfig,
        async (
          jobLocation: string,
          jobStatus: string,
          errMessage: string,
          logName: string
        ) => {
          await saveToCsv(
            defaultCsvLoc?.absolutePath || csvFile,
            csvFileAbleToSave,
            flowName,
            flow.predecessors || ['none'],
            jobLocation,
            jobStatus,
            errMessage,
            logName as string
          ).catch((err) => displayError(err, 'Error while saving CSV file.'))
        }
      )
      if (!jobStatus) failAllSuccessors(flows, flowName)
      if (flowStatus.terminate) reject(flowStatus.message)

      const { completed, completedWithAllSuccess } = isFlowsCompleted(flows)
      if (completed) {
        if (completedWithAllSuccess)
          resolve(defaultCsvLoc?.absolutePath || getRealPath(csvFile))
        else resolve(false)
      }
    }

    Object.keys(flows).forEach(preExecuteFlow)
  })
}
