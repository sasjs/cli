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
  createTestGlobalTarget,
  removeTestApp,
  removeTestServerFolder
} from '../../../utils/test'
import { removeFromGlobalConfig } from '../../../utils/config'
import { runSasJob } from '../request'
import { build } from '../../build/build'
import { deploy } from '../../deploy/deploy'

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

describe('sasjs request without compute API', () => {
  let target: Target
  const dataPathRel = 'data.json'
  const configPathRel = 'sasjsconfig-temp.json'

  beforeAll(async () => {
    const appName = 'cli-tests-request-' + generateTimestamp()
    await createTestApp(__dirname, appName)
    target = await createTestGlobalTarget(
      appName,
      `/Public/app/cli-tests/${appName}`,
      {
        serviceFolders: ['sasjs/runRequest'],
        initProgram: '',
        termProgram: '',
        macroVars: {}
      }
    )
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
    await removeFromGlobalConfig(target.name)
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
    await expect(
      runSasJob(
        target,
        false,
        `/Public/app/cli-tests/${target.name}/services/runRequest/sendArr`,
        dataPathRel
      )
    ).toResolve()
    const rawData = await readFile(`${process.projectDir}/output.json`)
    const output = JSON.parse(rawData)

    expect(output.table1).toEqual(expectedDataArr.table1)
    expect(output.table2).toEqual(expectedDataArr.table2)
  })

  it(`should execute service 'sendObj' with absolute path`, async () => {
    await expect(
      runSasJob(
        target,
        false,
        `/Public/app/cli-tests/${target.name}/services/runRequest/sendObj`,
        dataPathRel
      )
    ).toResolve()
    const rawData = await readFile(`${process.projectDir}/output.json`)
    const output = JSON.parse(rawData)

    expect(output.table1).toEqual(expectedDataObj.table1)
    expect(output.table2).toEqual(expectedDataObj.table2)
  })

  it(`should execute service 'sendArr' with relative path`, async () => {
    await expect(
      runSasJob(target, false, 'services/runRequest/sendArr', dataPathRel)
    ).toResolve()

    const rawData = await readFile(`${process.projectDir}/output.json`)
    const output = JSON.parse(rawData)

    expect(output.table1).toEqual(expectedDataArr.table1)
    expect(output.table2).toEqual(expectedDataArr.table2)
  })

  it(`should execute service 'sendObj' with relative path`, async () => {
    await expect(
      runSasJob(target, false, 'services/runRequest/sendObj', dataPathRel)
    ).toResolve()

    const rawData = await readFile(`${process.projectDir}/output.json`)
    const output = JSON.parse(rawData)

    expect(output.table1).toEqual(expectedDataObj.table1)
    expect(output.table2).toEqual(expectedDataObj.table2)
  })
})

describe('sasjs request with SAS9', () => {
  let target: Target
  const dataPathRel = 'data.json'
  const configPathRel = 'sasjsconfig-temp.json'

  beforeAll(async () => {
    const appName = 'cli-tests-request-sas9-' + generateTimestamp()
    await createTestApp(__dirname, appName)
    target = await createTestGlobalTarget(
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
    await removeFromGlobalConfig(target.name)
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
    await expect(
      runSasJob(
        target,
        false,
        `/Public/app/cli-tests/${target.name}/services/runRequest/sendArr`,
        dataPathRel
      )
    ).toResolve()
    const rawData = await readFile(`${process.projectDir}/output.json`)
    const output = JSON.parse(rawData)

    expect(output.table1).toEqual(expectedDataArr.table1)
    expect(output.table2).toEqual(expectedDataArr.table2)
  })

  it(`should execute service 'sendObj' with absolute path`, async () => {
    await expect(
      runSasJob(
        target,
        false,
        `/Public/app/cli-tests/${target.name}/services/runRequest/sendObj`,
        dataPathRel
      )
    ).toResolve()
    const rawData = await readFile(`${process.projectDir}/output.json`)
    const output = JSON.parse(rawData)

    expect(output.table1).toEqual(expectedDataObj.table1)
    expect(output.table2).toEqual(expectedDataObj.table2)
  })

  it(`should execute service 'sendArr' with relative path`, async () => {
    await expect(
      runSasJob(target, false, 'services/runRequest/sendArr', dataPathRel)
    ).toResolve()

    const rawData = await readFile(`${process.projectDir}/output.json`)
    const output = JSON.parse(rawData)

    expect(output.table1).toEqual(expectedDataArr.table1)
    expect(output.table2).toEqual(expectedDataArr.table2)
  })

  it(`should execute service 'sendObj' with relative path`, async () => {
    await expect(
      runSasJob(target, false, 'services/runRequest/sendObj', dataPathRel)
    ).toResolve()

    const rawData = await readFile(`${process.projectDir}/output.json`)
    const output = JSON.parse(rawData)

    expect(output.table1).toEqual(expectedDataObj.table1)
    expect(output.table2).toEqual(expectedDataObj.table2)
  })
})

describe(`sasjs request with compute API`, () => {
  let target: Target
  const dataPathRel = 'data.json'
  const configPathRel = 'sasjsconfig-temp.json'

  beforeAll(async () => {
    const appName = 'cli-tests-request-' + generateTimestamp()
    await createTestApp(__dirname, appName)
    target = await createTestGlobalTarget(
      appName,
      `/Public/app/cli-tests/${appName}`,
      {
        serviceFolders: ['sasjs/runRequest'],
        initProgram: '',
        termProgram: '',
        macroVars: {}
      }
    )
    await copy(
      path.join(__dirname, 'runRequest'),
      path.join(process.projectDir, 'sasjs', 'runRequest')
    )

    await build(target)
    await deploy(target, false)
  })

  afterAll(async () => {
    await removeFromGlobalConfig(target.name)
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
          contextName: process.sasjsConstants.contextName
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
    await expect(
      runSasJob(
        target,
        false,
        `/Public/app/cli-tests/${target.name}/services/runRequest/sendArr`,
        dataPathRel,
        configPathRel
      )
    ).toResolve()

    const rawData = await readFile(`${process.projectDir}/output.json`)
    const output = JSON.parse(rawData)

    expect(output.table1).toEqual(expectedDataArr.table1)
    expect(output.table2).toEqual(expectedDataArr.table2)
  })

  it(`should execute service 'sendObj' with absolute path`, async () => {
    await expect(
      runSasJob(
        target,
        false,
        `/Public/app/cli-tests/${target.name}/services/runRequest/sendObj`,
        dataPathRel,
        configPathRel
      )
    ).toResolve()

    const rawData = await readFile(`${process.projectDir}/output.json`)
    const output = JSON.parse(rawData)

    expect(output.table1).toEqual(expectedDataObj.table1)
    expect(output.table2).toEqual(expectedDataObj.table2)
  })

  it(`should execute service 'sendArr' with relative path`, async () => {
    await expect(
      runSasJob(target, false, 'services/runRequest/sendArr', dataPathRel)
    ).toResolve()

    const rawData = await readFile(`${process.projectDir}/output.json`)
    const output = JSON.parse(rawData)

    expect(output.table1).toEqual(expectedDataArr.table1)
    expect(output.table2).toEqual(expectedDataArr.table2)
  })

  it(`should execute service 'sendObj' with relative path`, async () => {
    await expect(
      runSasJob(target, false, 'services/runRequest/sendObj', dataPathRel)
    ).toResolve()

    const rawData = await readFile(`${process.projectDir}/output.json`)
    const output = JSON.parse(rawData)

    expect(output.table1).toEqual(expectedDataObj.table1)
    expect(output.table2).toEqual(expectedDataObj.table2)
  })
})
