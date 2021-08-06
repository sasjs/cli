import path from 'path'
import {
  createFile,
  createFolder,
  deleteFile,
  deleteFolder,
  fileExists,
  generateTimestamp,
  Target
} from '@sasjs/utils'
import { validateParams } from '..'
import * as module from '../../../../constants'
import * as configUtils from '../../../../utils/config'
import examples from '../../examples'

describe('validateParams', () => {
  let appFolder = path.join(
    __dirname,
    `cli-tests-validateParams-${generateTimestamp()}`
  )
  beforeAll(async () => {
    await createFolder(appFolder)
    process.projectDir = appFolder

    jest.spyOn(module, 'getConstants').mockImplementation(() =>
      Promise.resolve({
        buildDestinationFolder: appFolder
      } as any)
    )
  })

  afterAll(async () => {
    await deleteFolder(appFolder)
  })

  it('should return terminate flag, if source is not provided', async () => {
    const { terminate, message } = await validateParams(
      undefined as any as string,
      undefined as any as string,
      undefined as any as string,
      undefined as any as Target
    )

    expect(terminate).toEqual(true)
    expect(message).toEqual(
      `Please provide flow source (--source) file.\n${examples.command}`
    )
  })

  it('should return terminate flag, if source is not JSON File', async () => {
    const { terminate, message } = await validateParams(
      'source.txt',
      undefined as any as string,
      undefined as any as string,
      undefined as any as Target
    )

    expect(terminate).toEqual(true)
    expect(message).toEqual(
      `Please provide flow source (--source) file.\n${examples.command}`
    )
  })

  it('should return terminate flag, if source File does not exist', async () => {
    const { terminate, message } = await validateParams(
      'source.json',
      undefined as any as string,
      undefined as any as string,
      undefined as any as Target
    )

    expect(terminate).toEqual(true)
    expect(message).toEqual(`Source file does not exist.\n${examples.command}`)
  })

  it('should return terminate flag, if source File content is not valid JSON', async () => {
    const source = path.join(appFolder, 'source.json')

    await createFile(source, '{ SOME : CONTENT : INVALID }')

    const { terminate, message } = await validateParams(
      source,
      undefined as any as string,
      undefined as any as string,
      undefined as any as Target
    )

    expect(terminate).toEqual(true)
    expect(message).toEqual(
      `Unable to parse JSON of provided source file.\n${examples.source}`
    )
    await deleteFile(source)
  })

  it('should return terminate flag, if source File content has no flows property', async () => {
    const source = path.join(appFolder, 'source.json')

    await createFile(source, '{ "notFlows": [] }')

    const { terminate, message } = await validateParams(
      source,
      undefined as any as string,
      undefined as any as string,
      undefined as any as Target
    )

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

    const { terminate, message } = await validateParams(
      source,
      'csv.txt',
      undefined as any as string,
      undefined as any as Target
    )

    expect(terminate).toEqual(true)
    expect(message).toEqual(
      `Please provide csv file location (--csvFile).\n${examples.command}`
    )
    await deleteFile(source)
  })

  it('should not return terminate flag, if all params are valid ', async () => {
    const source = path.join(appFolder, 'source.json')
    const csv = path.join(appFolder, 'data.csv')

    await createFile(source, '{ "flows": [] }')

    jest
      .spyOn(configUtils, 'getAuthConfig')
      .mockImplementation(() => Promise.resolve({} as any))

    const { terminate, flows } = await validateParams(
      source,
      csv,
      'mylogs',
      undefined as any as Target
    )

    expect(terminate).toEqual(false)
    expect(flows).toEqual([])

    await deleteFile(source)
    await deleteFile(csv)
  })

  it('should return with default csv file location', async () => {
    const source = path.join(appFolder, 'source.json')
    const csvDefaultLoc = path.join(appFolder, 'sasjsbuild', 'flowResults.csv')

    await createFile(source, '{ "flows": [] }')

    jest
      .spyOn(configUtils, 'getAuthConfig')
      .mockImplementation(() => Promise.resolve({} as any))
    jest
      .spyOn(configUtils, 'getLocalOrGlobalConfig')
      .mockImplementation(() => Promise.resolve({ isLocal: true } as any))

    const { terminate, flows } = await validateParams(
      source,
      undefined as any as string,
      'mylogs',
      undefined as any as Target
    )

    expect(terminate).toEqual(false)
    expect(flows).toEqual([])

    await expect(fileExists(csvDefaultLoc)).resolves.toEqual(true)

    await deleteFile(source)
    await deleteFile(csvDefaultLoc)
  })
})
