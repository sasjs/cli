import dotenv from 'dotenv'
import path from 'path'
import rimraf from 'rimraf'
import { readFile } from '../../../src/utils/file-utils'
import { generateTimestamp } from '../../../src/utils/utils'
import { runRequest, compileBuildDeployServices } from '../../../src/main'
import {
  createFolder,
  deleteFolder,
  createFile
} from '../../../src/utils/file-utils'
import { remove } from '../../../src/sasjs-folder/remove'
import { SASjs } from '@sasjs/adapter/node'

describe('sasjs request', () => {
  let config
  const dataPathRel = 'data.json'
  const configPathRel = 'sasjsconfig-temp.json'
  const timestamp = generateTimestamp()

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

  const targetName = 'cli-tests-request'

  beforeAll(async () => {
    dotenv.config()
    process.projectDir = path.join(process.cwd())

    config = createConfig(targetName, timestamp)

    await addToGlobalConfigs(config)

    const command = `cbd ${targetName} -f`.split(' ')
    await expect(compileBuildDeployServices(command)).resolves.toEqual(true)

    const sasjsBuildDirPath = path.join(process.projectDir, 'sasjsbuild')
    await deleteFolder(sasjsBuildDirPath)
  }, 60 * 1000)

  beforeEach(async () => {
    const timestamp = generateTimestamp()
    const parentFolderNameTimeStamped = `cli-tests-request-${timestamp}`

    process.projectDir = path.join(process.cwd(), parentFolderNameTimeStamped)

    await createFolder(process.projectDir)
    await createFile(
      path.join(process.projectDir, configPathRel),
      JSON.stringify(config, null, 2)
    )
    await createFile(
      path.join(process.projectDir, dataPathRel),
      JSON.stringify(sampleDataJson, null, 2)
    )
  }, 60 * 1000)

  it(
    `should execute service 'sendArr'`,
    async () => {
      await expect(
        runRequest(
          `/Public/app/cli-tests-${timestamp}/runRequest/sendArr`,
          dataPathRel,
          'default',
          targetName
        )
      ).resolves.toEqual(true)
      const rawData = await readFile(`${process.projectDir}/output.json`)
      const output = JSON.parse(rawData)

      for (const tableName in sampleDataJson) {
        expect(output[tableName]).toEqual(expectedDataArr[tableName])
      }
    },
    60 * 1000
  )

  // describe(`with default config`, () => {
  //   describe(`having absolute path`, () => {
  //     it(
  //       `should execute service 'sendArr'`,
  //       async () => {
  //         await expect(
  //           runRequest(
  //             `/Public/app/cli-tests-${timestamp}/runRequest/sendArr`,
  //             dataPathRel,
  //             'default',
  //             targetName
  //           )
  //         ).resolves.toEqual(true)
  //         const rawData = await readFile(`${process.projectDir}/output.json`)
  //         const output = JSON.parse(rawData)

  //         for (const tableName in sampleDataJson) {
  //           expect(output[tableName]).toEqual(expectedDataArr[tableName])
  //         }
  //       },
  //       60 * 1000
  //     )

  //     it(
  //       `should execute service 'sendObj'`,
  //       async () => {
  //         await expect(
  //           runRequest(
  //             `/Public/app/cli-tests-${timestamp}/runRequest/sendObj`,
  //             dataPathRel,
  //             'default',
  //             targetName
  //           )
  //         ).resolves.toEqual(true)
  //         const rawData = await readFile(`${process.projectDir}/output.json`)
  //         const output = JSON.parse(rawData)

  //         for (const tableName in sampleDataJson) {
  //           expect(output[tableName]).toEqual(expectedDataObj[tableName])
  //         }
  //       },
  //       60 * 1000
  //     )
  //   })

  //   describe(`having relative path`, () => {
  //     it(
  //       `should execute service 'sendArr'`,
  //       async () => {
  //         await expect(
  //           runRequest('runRequest/sendArr', dataPathRel, 'default', targetName)
  //         ).resolves.toEqual(true)

  //         const rawData = await readFile(`${process.projectDir}/output.json`)
  //         const output = JSON.parse(rawData)

  //         for (const tableName in sampleDataJson) {
  //           expect(output[tableName]).toEqual(expectedDataArr[tableName])
  //         }
  //       },
  //       60 * 1000
  //     )

  //     it(
  //       `should execute service sendObj`,
  //       async () => {
  //         await expect(
  //           runRequest('runRequest/sendObj', dataPathRel, 'default', targetName)
  //         ).resolves.toEqual(true)

  //         const rawData = await readFile(`${process.projectDir}/output.json`)
  //         const output = JSON.parse(rawData)

  //         for (const tableName in sampleDataJson) {
  //           expect(output[tableName]).toEqual(expectedDataObj[tableName])
  //         }
  //       },
  //       60 * 1000
  //     )
  //   })
  // })

  // describe(`with useComputeApi: 'SAS Studio compute context'`, () => {
  //   describe(`having absolute path`, () => {
  //     it(
  //       `should execute service 'sendArr'`,
  //       async () => {
  //         await expect(
  //           runRequest(
  //             `/Public/app/cli-tests-${timestamp}/runRequest/sendArr`,
  //             dataPathRel,
  //             configPathRel,
  //             targetName
  //           )
  //         ).resolves.toEqual(true)

  //         const rawData = await readFile(`${process.projectDir}/output.json`)
  //         const output = JSON.parse(rawData)

  //         for (const tableName in sampleDataJson) {
  //           expect(output[tableName]).toEqual(expectedDataArr[tableName])
  //         }
  //       },
  //       60 * 1000
  //     )

  //     it(
  //       `should execute service 'sendObj'`,
  //       async () => {
  //         await expect(
  //           runRequest(
  //             `/Public/app/cli-tests-${timestamp}/runRequest/sendObj`,
  //             dataPathRel,
  //             configPathRel,
  //             targetName
  //           )
  //         ).resolves.toEqual(true)

  //         const rawData = await readFile(`${process.projectDir}/output.json`)
  //         const output = JSON.parse(rawData)

  //         for (const tableName in sampleDataJson) {
  //           expect(output[tableName]).toEqual(expectedDataObj[tableName])
  //         }
  //       },
  //       60 * 1000
  //     )
  //   })

  //   describe(`with relative path`, () => {
  //     it(
  //       `should execute service 'sendArr'`,
  //       async () => {
  //         await expect(
  //           runRequest(
  //             'runRequest/sendArr',
  //             dataPathRel,
  //             configPathRel,
  //             targetName
  //           )
  //         ).resolves.toEqual(true)

  //         const rawData = await readFile(`${process.projectDir}/output.json`)
  //         const output = JSON.parse(rawData)

  //         for (const tableName in sampleDataJson) {
  //           expect(output[tableName]).toEqual(expectedDataArr[tableName])
  //         }
  //       },
  //       60 * 1000
  //     )

  //     it(
  //       `should execute service 'sendObj'`,
  //       async () => {
  //         await expect(
  //           runRequest(
  //             'runRequest/sendObj',
  //             dataPathRel,
  //             configPathRel,
  //             targetName
  //           )
  //         ).resolves.toEqual(true)

  //         const rawData = await readFile(`${process.projectDir}/output.json`)
  //         const output = JSON.parse(rawData)

  //         for (const tableName in sampleDataJson) {
  //           expect(output[tableName]).toEqual(expectedDataObj[tableName])
  //         }
  //       },
  //       60 * 1000
  //     )
  //   })
  // })
  afterAll(async () => {
    rimraf.sync('./cli-tests-request-*')
    await removeFromGlobalConfigs(targetName)
    const adapter = new SASjs({
      appLoc: config.appLoc,
      serverType: config.serverType,
      useComputeApi: config.useComputeApi
    })

    await remove(adapter.appLoc, adapter, process.env.ACCESS_TOKEN)
  }, 60 * 1000)
})

const createConfig = (targetName, timestamp) => ({
  name: targetName,
  serverType: process.env.SERVER_TYPE,
  serverUrl: process.env.SERVER_URL,
  appLoc: `/Public/app/cli-tests-${timestamp}`,
  useComputeApi: true,
  contextName: 'SAS Studio compute context', // FIXME: should not be hard coded
  tgtServices: ['../test/commands/request/runRequest'],
  authInfo: {
    client: process.env.CLIENT,
    secret: process.env.SECRET,
    access_token: process.env.ACCESS_TOKEN,
    refresh_token: process.env.REFRESH_TOKEN
  },
  tgtDeployVars: {
    client: process.env.CLIENT,
    secret: process.env.SECRET
  },
  deployServicePack: true,
  tgtDeployScripts: []
})
