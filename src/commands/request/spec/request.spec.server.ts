import path from 'path'
import {
  copy,
  readFile,
  deleteFolder,
  createFile,
  ServerType,
  AuthConfig
} from '@sasjs/utils'
import { Target, generateTimestamp } from '@sasjs/utils'
import {
  createTestApp,
  generateTestTarget,
  removeTestApp,
  removeTestServerFolder
} from '../../../utils/test'
import * as timeStampUtils from '@sasjs/utils/time'
import { getAuthConfig } from '../../../utils/config'
import { runSasJob } from '../request'
import { build } from '../../build/build'
import { deploy } from '../../deploy/deploy'
import { contextName, prefixAppLoc } from '../../../utils'
import { getLogFilePath } from '../../../utils/getLogFilePath'
import { statSync } from 'fs'

const sampleDataJson = {
  table1: [
    { col1: 'first col value1', col2: 'second col value1' },
    { col1: 'first col value2', col2: 'second col value2' }
  ],
  table2: [{ col1: 'first col value' }]
}
const expectedDataArr = {
  table1: [
    ['first col value1', 'second col value1'],
    ['first col value2', 'second col value2']
  ],
  table2: [['first col value']]
}
const expectedDataObj = {
  table1: [
    {
      COL1: 'first col value1',
      COL2: 'second col value1'
    },
    {
      COL1: 'first col value2',
      COL2: 'second col value2'
    }
  ],
  table2: [
    {
      COL1: 'first col value'
    }
  ]
}

const getOutputJson = async (fileName: string) =>
  JSON.parse(
    await readFile(
      path.join(
        process.sasjsConstants.buildDestinationResultsFolder,
        'requests',
        fileName
      )
    )
  )

describe.only('sasjs request without compute API', () => {
  const appName = 'cli-tests-request-' + generateTimestamp()
  const target: Target = generateTestTarget(
    appName,
    `/Public/app/cli-tests/${appName}`,
    {
      serviceFolders: ['sasjs/runRequest'],
      initProgram: '',
      termProgram: '',
      macroVars: {}
    },
    ServerType.SasViya
  )
  let authConfig: AuthConfig
  const dataPathRel = 'data.json'
  const configPathRel = 'sasjsconfig-temp.json'

  beforeAll(async () => {
    await createTestApp(__dirname, appName)
    authConfig = await getAuthConfig(target)
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
        `/Public/app/cli-tests/${target.name}/services/runRequest/sendArr`,
        dataPathRel,
        undefined,
        authConfig
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
        `/Public/app/cli-tests/${target.name}/services/runRequest/sendObj`,
        dataPathRel,
        undefined,
        authConfig
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
      runSasJob(
        target,
        false,
        'services/runRequest/sendArr',
        dataPathRel,
        undefined,
        authConfig
      )
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
      runSasJob(
        target,
        false,
        'services/runRequest/sendObj',
        dataPathRel,
        undefined,
        authConfig
      )
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
        `/Public/app/cli-tests/${target.name}/services/runRequest/sendArr`,
        dataPathRel,
        undefined,
        authConfig,
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
    const timestamp = generateTimestamp()
    jest
      .spyOn(timeStampUtils, 'generateTimestamp')
      .mockImplementationOnce(() => timestamp)
    const outputFilename = `err-${timestamp}.json`
    const jobPath = prefixAppLoc(
      target.appLoc,
      'services/runRequest/err'
    ) as string
    const log = (await getLogFilePath('./mylog.txt', jobPath || '')) as string

    await expect(
      runSasJob(
        target,
        false,
        jobPath,
        dataPathRel,
        undefined,
        authConfig,
        log,
        jobPath
      )
    ).toResolve()

    const rawLogDataStats = statSync(log)
    const rawDataStats = statSync(
      path.join(
        process.sasjsConstants.buildDestinationResultsFolder,
        'requests',
        outputFilename
      )
    )

    expect(rawLogDataStats.size).toBeGreaterThan(10)
    expect(rawDataStats.size).toBeGreaterThan(10)
  })

  it(`should execute service 'err' with absolute path with default log path`, async () => {
    const timestamp = generateTimestamp()
    jest
      .spyOn(timeStampUtils, 'generateTimestamp')
      .mockImplementationOnce(() => timestamp)
    const outputFilename = `err-${timestamp}.json`
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
        authConfig,
        log,
        jobPath
      )
    ).toResolve()

    const rawLogDataStats = statSync(log)
    const rawDataStats = statSync(
      path.join(
        process.sasjsConstants.buildDestinationResultsFolder,
        'requests',
        outputFilename
      )
    )

    expect(rawLogDataStats.size).toBeGreaterThan(10)
    expect(rawDataStats.size).toBeGreaterThan(10)
  })
})

describe('sasjs request with SAS9', () => {
  const appName = 'cli-tests-request-sas9-' + generateTimestamp()
  const target: Target = generateTestTarget(
    appName,
    `/Public/app/cli-tests/${appName}`,
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
        `/Public/app/cli-tests/${target.name}/services/runRequest/sendArr`,
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
        `/Public/app/cli-tests/${target.name}/services/runRequest/sendObj`,
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
        `/Public/app/cli-tests/${target.name}/services/runRequest/sendArr`,
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
    const timestamp = generateTimestamp()
    jest
      .spyOn(timeStampUtils, 'generateTimestamp')
      .mockImplementationOnce(() => timestamp)
    const outputFilename = `err-${timestamp}.json`
    const jobPath = prefixAppLoc(
      target.appLoc,
      'services/runRequest/err'
    ) as string
    const log = (await getLogFilePath('./mylog.txt', jobPath || '')) as string

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
    const rawDataStats = statSync(
      path.join(
        process.sasjsConstants.buildDestinationResultsFolder,
        'requests',
        outputFilename
      )
    )

    expect(rawLogDataStats.size).toBeGreaterThan(10)
    expect(rawDataStats.size).toBeGreaterThan(10)
  })

  it(`should execute service 'err' with absolute path with default log path`, async () => {
    const timestamp = generateTimestamp()
    jest
      .spyOn(timeStampUtils, 'generateTimestamp')
      .mockImplementationOnce(() => timestamp)
    const outputFilename = `err-${timestamp}.json`
    const jobPath = prefixAppLoc(
      target.appLoc,
      'services/runRequest/err'
    ) as string
    const log = (await getLogFilePath('', jobPath || '')) as string

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
    const rawDataStats = statSync(
      path.join(
        process.sasjsConstants.buildDestinationResultsFolder,
        'requests',
        outputFilename
      )
    )

    expect(rawLogDataStats.size).toBeGreaterThan(10)
    expect(rawDataStats.size).toBeGreaterThan(10)
  })
})

describe(`sasjs request with compute API`, () => {
  const appName = 'cli-tests-request-' + generateTimestamp()
  const target: Target = generateTestTarget(
    appName,
    `/Public/app/cli-tests/${appName}`,
    {
      serviceFolders: ['sasjs/runRequest'],
      initProgram: '',
      termProgram: '',
      macroVars: {}
    }
  )
  let authConfig: AuthConfig
  const dataPathRel = 'data.json'
  const configPathRel = 'sasjsconfig-temp.json'

  beforeAll(async () => {
    await createTestApp(__dirname, appName)
    authConfig = await getAuthConfig(target)
    await copy(
      path.join(__dirname, 'runRequest'),
      path.join(process.projectDir, 'sasjs', 'runRequest')
    )

    await build(target)
    await deploy(target, false)
  })

  afterAll(async () => {
    await removeTestServerFolder(target.appLoc, target)
    await removeTestApp(__dirname, target.name)
  })

  beforeEach(async () => {
    await createFile(
      path.join(process.projectDir, configPathRel),
      JSON.stringify(
        {
          ...target.toJson(),
          useComputeApi: true,
          contextName
        },
        null,
        2
      )
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
        `/Public/app/cli-tests/${target.name}/services/runRequest/sendArr`,
        dataPathRel,
        configPathRel,
        authConfig
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
        `/Public/app/cli-tests/${target.name}/services/runRequest/sendObj`,
        dataPathRel,
        configPathRel,
        authConfig
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
      runSasJob(
        target,
        false,
        'services/runRequest/sendArr',
        dataPathRel,
        undefined,
        authConfig
      )
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
      runSasJob(
        target,
        false,
        'services/runRequest/sendObj',
        dataPathRel,
        undefined,
        authConfig
      )
    ).toResolve()

    expect((await getOutputJson(outputFilename)).table1).toEqual(
      expectedDataObj.table1
    )
    expect((await getOutputJson(outputFilename)).table2).toEqual(
      expectedDataObj.table2
    )
  })
})
