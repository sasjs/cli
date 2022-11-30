import path from 'path'
import {
  copy,
  readFile,
  deleteFolder,
  createFile,
  ServerType
} from '@sasjs/utils'
import { Target, generateTimestamp } from '@sasjs/utils'
import {
  createTestApp,
  generateTestTarget,
  removeTestApp,
  removeTestServerFolder
} from '../../../utils/test'
import * as timeStampUtils from '@sasjs/utils/time'
import { runSasJob } from '../request'
import { build } from '../../build/build'
import { deploy } from '../../deploy/deploy'
import { prefixAppLoc } from '../../../utils'
import { getLogFilePath } from '../../../utils/getLogFilePath'
import { statSync } from 'fs'
import {
  sampleDataJson,
  expectedDataArr,
  expectedDataObj,
  getOutputJson
} from './utils'
import dotenv from 'dotenv'

dotenv.config()

describe('sasjs request with SAS9', () => {
  const appName = 'cli-tests-request-sas9-' + generateTimestamp()
  const locationPrefix = `/User Folders/cli-tests/${process.env.SAS_USERNAME}/`
  const target: Target = generateTestTarget(
    appName,
    `${locationPrefix}${appName}`,
    {
      serviceFolders: ['sasjs/runRequest'],
      initProgram: '',
      termProgram: '',
      macroVars: {}
    },
    ServerType.Sas9
  )
  const dataPathRel = 'data.json'
  const configPathRel = 'sasjsconfig-temp.json'

  beforeAll(async () => {
    await createTestApp(__dirname, appName)
    await copy(
      path.join(__dirname, 'runRequest'),
      path.join(process.projectDir, 'sasjs', 'runRequest')
    )

    await build(target)
    await deploy(target, false)

    const sasjsBuildDirPath = path.join(process.projectDir, 'sasjsbuild')
    await deleteFolder(sasjsBuildDirPath)
  })

  afterAll(async () => {
    await removeTestServerFolder(target.appLoc, target)
    await removeTestApp(__dirname, target.name)
  })

  beforeEach(async () => {
    await createFile(
      path.join(process.projectDir, configPathRel),
      JSON.stringify(target.toJson(), null, 2)
    )
    await createFile(
      path.join(process.projectDir, dataPathRel),
      JSON.stringify(sampleDataJson, null, 2)
    )
  })

  it(`should execute service 'sendArr' with absolute path`, async () => {
    const timestamp = generateTimestamp()
    jest
      .spyOn(timeStampUtils, 'generateTimestamp')
      .mockImplementationOnce(() => timestamp)
    const outputFilename = `sendArr-${timestamp}.json`
    await expect(
      runSasJob(
        target,
        false,
        `${locationPrefix}${target.name}/services/runRequest/sendArr`,
        dataPathRel
      )
    ).toResolve()

    expect((await getOutputJson(outputFilename)).table1).toEqual(
      expectedDataArr.table1
    )
    expect((await getOutputJson(outputFilename)).table2).toEqual(
      expectedDataArr.table2
    )
  })

  it(`should execute service 'sendObj' with absolute path`, async () => {
    const timestamp = generateTimestamp()
    jest
      .spyOn(timeStampUtils, 'generateTimestamp')
      .mockImplementationOnce(() => timestamp)
    const outputFilename = `sendObj-${timestamp}.json`
    await expect(
      runSasJob(
        target,
        false,
        `${locationPrefix}${target.name}/services/runRequest/sendObj`,
        dataPathRel
      )
    ).toResolve()

    expect((await getOutputJson(outputFilename)).table1).toEqual(
      expectedDataObj.table1
    )
    expect((await getOutputJson(outputFilename)).table2).toEqual(
      expectedDataObj.table2
    )
  })

  it(`should execute service 'sendArr' with relative path`, async () => {
    const timestamp = generateTimestamp()
    jest
      .spyOn(timeStampUtils, 'generateTimestamp')
      .mockImplementationOnce(() => timestamp)
    const outputFilename = `sendArr-${timestamp}.json`
    await expect(
      runSasJob(target, false, 'services/runRequest/sendArr', dataPathRel)
    ).toResolve()

    expect((await getOutputJson(outputFilename)).table1).toEqual(
      expectedDataArr.table1
    )
    expect((await getOutputJson(outputFilename)).table2).toEqual(
      expectedDataArr.table2
    )
  })

  it(`should execute service 'sendObj' with relative path`, async () => {
    const timestamp = generateTimestamp()
    jest
      .spyOn(timeStampUtils, 'generateTimestamp')
      .mockImplementationOnce(() => timestamp)
    const outputFilename = `sendObj-${timestamp}.json`
    await expect(
      runSasJob(target, false, 'services/runRequest/sendObj', dataPathRel)
    ).toResolve()

    expect((await getOutputJson(outputFilename)).table1).toEqual(
      expectedDataObj.table1
    )
    expect((await getOutputJson(outputFilename)).table2).toEqual(
      expectedDataObj.table2
    )
  })

  it(`should execute service 'sendArr' with absolute path with output path`, async () => {
    await expect(
      runSasJob(
        target,
        false,
        `${locationPrefix}${target.name}/services/runRequest/sendArr`,
        dataPathRel,
        undefined,
        undefined,
        undefined,
        undefined,
        './myoutput.json'
      )
    ).toResolve()

    const rawData = await readFile(
      path.join(process.projectDir, 'myoutput.json')
    )
    const output = JSON.parse(rawData)

    expect(output.table1).toEqual(expectedDataArr.table1)
    expect(output.table2).toEqual(expectedDataArr.table2)
  })

  it(`should execute service 'err' with absolute path with log path`, async () => {
    const jobPath = prefixAppLoc(
      target.appLoc,
      'services/runRequest/err'
    ) as string
    const log = getLogFilePath('./mylog.txt', jobPath || '') as string

    await expect(
      runSasJob(
        target,
        false,
        jobPath,
        dataPathRel,
        undefined,
        undefined,
        log,
        jobPath
      )
    ).toResolve()

    const rawLogDataStats = statSync(log)

    expect(rawLogDataStats.size).toBeGreaterThan(10)
  })

  it(`should execute service 'err' with absolute path with default log path`, async () => {
    const jobPath = prefixAppLoc(
      target.appLoc,
      'services/runRequest/err'
    ) as string
    const log = getLogFilePath('', jobPath || '') as string

    await expect(
      runSasJob(
        target,
        false,
        jobPath,
        dataPathRel,
        undefined,
        undefined,
        log,
        jobPath
      )
    ).toResolve()
    const rawLogDataStats = statSync(log)

    expect(rawLogDataStats.size).toBeGreaterThan(10)
  })
})
