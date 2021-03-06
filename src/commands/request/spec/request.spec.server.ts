import path from 'path'
import { copy, readFile } from '../../../utils/file'
import { generateTimestamp } from '../../../utils/utils'
import { runRequest, compileBuildDeployServices } from '../../../main'
import { deleteFolder, createFile } from '../../../utils/file'
import { folder } from '../../folder/index'
import { Target } from '@sasjs/utils/types'
import {
  createTestApp,
  createTestGlobalTarget,
  removeTestApp
} from '../../../utils/test'
import { Command } from '../../../utils/command'
import { removeFromGlobalConfig } from '../../../utils/config'

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

  beforeAll(async (done) => {
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

    await compileBuildDeployServices(new Command(`cbd -t ${appName} -f`))

    const sasjsBuildDirPath = path.join(process.projectDir, 'sasjsbuild')
    await deleteFolder(sasjsBuildDirPath)
    done()
  })

  afterAll(async (done) => {
    await removeFromGlobalConfig(target.name)
    await folder(
      new Command(`folder delete ${target.appLoc} -t ${target.name}`)
    ).catch(() => {})
    await removeTestApp(__dirname, target.name)
    done()
  })

  beforeEach(async (done) => {
    await createFile(
      path.join(process.projectDir, configPathRel),
      JSON.stringify(target.toJson(), null, 2)
    )
    await createFile(
      path.join(process.projectDir, dataPathRel),
      JSON.stringify(sampleDataJson, null, 2)
    )
    done()
  })

  it(`should execute service 'sendArr' with absolute path`, async (done) => {
    await expect(
      runRequest(
        new Command(
          `request /Public/app/cli-tests/${target.name}/services/runRequest/sendArr -d ${dataPathRel} -t ${target.name}`
        )
      )
    ).toResolve()
    const rawData = await readFile(`${process.projectDir}/output.json`)
    const output = JSON.parse(rawData)

    expect(output.table1).toEqual(expectedDataArr.table1)
    expect(output.table2).toEqual(expectedDataArr.table2)
    done()
  })

  it(`should execute service 'sendObj' with absolute path`, async (done) => {
    await expect(
      runRequest(
        new Command(
          `request /Public/app/cli-tests/${target.name}/services/runRequest/sendObj -d ${dataPathRel} -t ${target.name}`
        )
      )
    ).toResolve()
    const rawData = await readFile(`${process.projectDir}/output.json`)
    const output = JSON.parse(rawData)

    expect(output.table1).toEqual(expectedDataObj.table1)
    expect(output.table2).toEqual(expectedDataObj.table2)
    done()
  })

  it(`should execute service 'sendArr' with relative path`, async (done) => {
    await expect(
      runRequest(
        new Command(
          `request services/runRequest/sendArr -d ${dataPathRel} -t ${target.name}`
        )
      )
    ).toResolve()

    const rawData = await readFile(`${process.projectDir}/output.json`)
    const output = JSON.parse(rawData)

    expect(output.table1).toEqual(expectedDataArr.table1)
    expect(output.table2).toEqual(expectedDataArr.table2)
    done()
  })

  it(`should execute service 'sendObj' with relative path`, async (done) => {
    await expect(
      runRequest(
        new Command(
          `request services/runRequest/sendObj -d ${dataPathRel} -t ${target.name}`
        )
      )
    ).toResolve()

    const rawData = await readFile(`${process.projectDir}/output.json`)
    const output = JSON.parse(rawData)

    expect(output.table1).toEqual(expectedDataObj.table1)
    expect(output.table2).toEqual(expectedDataObj.table2)
    done()
  })
})

describe(`sasjs request with compute API`, () => {
  let target: Target
  const dataPathRel = 'data.json'
  const configPathRel = 'sasjsconfig-temp.json'

  beforeAll(async (done) => {
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

    await compileBuildDeployServices(new Command(`cbd -t ${appName} -f`))

    done()
  })

  afterAll(async (done) => {
    await removeFromGlobalConfig(target.name)
    await folder(
      new Command(`folder delete ${target.appLoc} -t ${target.name}`)
    ).catch(() => {})
    await removeTestApp(__dirname, target.name)
    done()
  })

  beforeEach(async (done) => {
    await createFile(
      path.join(process.projectDir, configPathRel),
      JSON.stringify(
        {
          ...target.toJson(),
          useComputeApi: true,
          contextName: 'SAS Studio compute context'
        },
        null,
        2
      )
    )
    await createFile(
      path.join(process.projectDir, dataPathRel),
      JSON.stringify(sampleDataJson, null, 2)
    )
    done()
  })

  it(`should execute service 'sendArr' with absolute path`, async (done) => {
    await expect(
      runRequest(
        new Command(
          `request /Public/app/cli-tests/${target.name}/services/runRequest/sendArr -d ${dataPathRel} -c ${configPathRel} -t ${target.name}`
        )
      )
    ).toResolve()

    const rawData = await readFile(`${process.projectDir}/output.json`)
    const output = JSON.parse(rawData)

    expect(output.table1).toEqual(expectedDataArr.table1)
    expect(output.table2).toEqual(expectedDataArr.table2)
    done()
  })

  it(`should execute service 'sendObj' with absolute path`, async (done) => {
    await expect(
      runRequest(
        new Command(
          `request /Public/app/cli-tests/${target.name}/services/runRequest/sendObj -d ${dataPathRel} -c ${configPathRel} -t ${target.name}`
        )
      )
    ).toResolve()

    const rawData = await readFile(`${process.projectDir}/output.json`)
    const output = JSON.parse(rawData)

    expect(output.table1).toEqual(expectedDataObj.table1)
    expect(output.table2).toEqual(expectedDataObj.table2)
    done()
  })

  it(`should execute service 'sendArr' with relative path`, async (done) => {
    await expect(
      runRequest(
        new Command(
          `request services/runRequest/sendArr -d ${dataPathRel} -t ${target.name}`
        )
      )
    ).toResolve()

    const rawData = await readFile(`${process.projectDir}/output.json`)
    const output = JSON.parse(rawData)

    expect(output.table1).toEqual(expectedDataArr.table1)
    expect(output.table2).toEqual(expectedDataArr.table2)
    done()
  })

  it(`should execute service 'sendObj' with relative path`, async (done) => {
    await expect(
      runRequest(
        new Command(
          `request services/runRequest/sendObj -d ${dataPathRel} -c ${configPathRel} -t ${target.name}`
        )
      )
    ).toResolve()

    const rawData = await readFile(`${process.projectDir}/output.json`)
    const output = JSON.parse(rawData)

    expect(output.table1).toEqual(expectedDataObj.table1)
    expect(output.table2).toEqual(expectedDataObj.table2)
    done()
  })
})
