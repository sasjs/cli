import path from 'path'
import {
  createFile,
  createFolder,
  deleteFile,
  deleteFolder,
  fileExists,
  folderExists,
  generateTimestamp,
  Target
} from '@sasjs/utils'
import { validateParams } from '..'
import * as configUtils from '../../../../utils/config'
import examples from '../examples'

describe('validateParams', () => {
  let appFolder = path.join(
    __dirname,
    `cli-tests-validateParams-${generateTimestamp()}`
  )
  beforeAll(async () => {
    await createFolder(appFolder)
    process.projectDir = appFolder
    process.sasjsConstants = {
      buildDestinationFolder: path.join(appFolder, 'sasjsbuild')
    } as any
  })

  afterAll(async () => {
    await deleteFolder(appFolder)
  })

  it('should return terminate flag, if source is not provided', async () => {
    const { terminate, message } = await validateParams()

    expect(terminate).toEqual(true)
    expect(message).toEqual(
      `Please provide flow source (--source) file.\n${examples.command}`
    )
  })

  it('should return terminate flag, if source is not JSON File', async () => {
    const { terminate, message } = await validateParams('source.txt')

    expect(terminate).toEqual(true)
    expect(message).toEqual(
      `Please provide flow source (--source) file.\n${examples.command}`
    )
  })

  it('should return terminate flag, if source File does not exist', async () => {
    const { terminate, message } = await validateParams('source.json')

    expect(terminate).toEqual(true)
    expect(message).toEqual(`Source file does not exist.\n${examples.command}`)
  })

  it('should return terminate flag, if source File content is not valid JSON', async () => {
    const source = path.join(appFolder, 'source.json')

    await createFile(source, '{ SOME : CONTENT : INVALID }')

    const { terminate, message } = await validateParams(source)

    expect(terminate).toEqual(true)
    expect(message).toEqual(
      `Unable to parse JSON of provided source file.\n${examples.source}`
    )
    await deleteFile(source)
  })

  it('should return terminate flag, if source File content has no flows property', async () => {
    const source = path.join(appFolder, 'source.json')

    await createFile(source, '{ "notFlows": [] }')

    const { terminate, message } = await validateParams(source)

    expect(terminate).toEqual(true)
    expect(message).toEqual(
      `There are no flows present in source JSON.\n${examples.source}`
    )
    await deleteFile(source)
  })

  it('should return terminate flag, if csvFile is not CSV File ', async () => {
    const source = path.join(appFolder, 'source.json')

    await createFile(source, '{ "flows": [] }')

    jest
      .spyOn(configUtils, 'getAuthConfig')
      .mockImplementation(() => Promise.resolve({} as any))

    const { terminate, message } = await validateParams(source, 'csv.txt')

    expect(terminate).toEqual(true)
    expect(message).toEqual(
      `Please provide csv file location (--csvFile).\n${examples.command}`
    )
    await deleteFile(source)
  })

  it('should not return terminate flag, if all params are valid ', async () => {
    const source = path.join(appFolder, 'source.json')
    const csv = path.join(appFolder, 'data.csv')
    const logFolder = path.join(appFolder, 'my-logs')

    await createFile(source, '{ "flows": [] }')

    jest
      .spyOn(configUtils, 'getAuthConfig')
      .mockImplementation(() => Promise.resolve({} as any))

    const { terminate, flows } = await validateParams(source, csv, logFolder)

    expect(terminate).toEqual(false)
    expect(flows).toEqual([])

    await expect(fileExists(csv)).resolves.toEqual(true)
    await expect(folderExists(logFolder)).resolves.toEqual(true)

    await deleteFile(source)
    await deleteFile(csv)
    await deleteFolder(logFolder)
  })

  it('should not return terminate flag, creates default csv file and log folder location', async () => {
    const source = path.join(appFolder, 'source.json')
    const csvDefaultLoc = path.join(appFolder, 'sasjsbuild', 'flowResults.csv')
    const logFolderDefaultLoc = path.join(appFolder, 'sasjsbuild', 'logs')

    await createFile(source, '{ "flows": [] }')

    jest
      .spyOn(configUtils, 'getAuthConfig')
      .mockImplementation(() => Promise.resolve({} as any))
    jest
      .spyOn(configUtils, 'getLocalOrGlobalConfig')
      .mockImplementation(() => Promise.resolve({ isLocal: true } as any))

    const { terminate, flows, csvFile } = await validateParams(source)

    expect(terminate).toEqual(false)
    expect(flows).toEqual([])
    expect(csvFile).toEqual(csvDefaultLoc)

    await expect(fileExists(csvDefaultLoc)).resolves.toEqual(true)
    await expect(folderExists(logFolderDefaultLoc)).resolves.toEqual(true)

    await deleteFile(source)
    await deleteFile(csvDefaultLoc)
    await deleteFile(logFolderDefaultLoc)
  })
})
