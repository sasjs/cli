import dotenv from 'dotenv'
import path from 'path'
import { readFile } from '../../../src/utils/file'
import { generateTimestamp } from '../../../src/utils/utils'
import { runRequest, compileBuildDeployServices } from '../../../src/main'
import { createFolder, deleteFolder, createFile } from '../../../src/utils/file'

describe('sasjs request', () => {
  let config
  const timestampAppLoc = generateTimestamp()
  const dataPathRel = 'data.json'
  const configPathRel = 'sasjsconfig-temp.json'

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

  beforeAll(async (done) => {
    dotenv.config()
    process.projectDir = path.join(process.cwd())

    config = createConfig(targetName, timestampAppLoc)

    await addToGlobalConfigs(config)

    const command = `cbd ${targetName} -f`.split(' ')
    await expect(compileBuildDeployServices(command)).resolves.toEqual(true)

    const sasjsBuildDirPath = path.join(process.projectDir, 'sasjsbuild')
    await deleteFolder(sasjsBuildDirPath)
    done()
  }, 60 * 1000)

  beforeEach(async (done) => {
    const timestamp = generateTimestamp()
    const parentFolderNameTimeStamped = `test-app-request-${timestamp}`

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
    done()
  }, 60 * 1000)

  describe(`with default config`, () => {
    describe(`having absolute path`, () => {
      it(
        `should execute service 'sendArr'`,
        async () => {
          await expect(
            runRequest(
              `request /Public/app/cli-tests/${targetName}-${timestampAppLoc}/runRequest/sendArr -d ${dataPathRel} -t ${targetName}`
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

      it(
        `should execute service 'sendObj'`,
        async () => {
          await expect(
            runRequest(
              `request /Public/app/cli-tests/${targetName}-${timestampAppLoc}/runRequest/sendObj -d ${dataPathRel} -t ${targetName}`
            )
          ).resolves.toEqual(true)
          const rawData = await readFile(`${process.projectDir}/output.json`)
          const output = JSON.parse(rawData)

          for (const tableName in sampleDataJson) {
            expect(output[tableName]).toEqual(expectedDataObj[tableName])
          }
        },
        60 * 1000
      )
    })

    describe(`having relative path`, () => {
      it(
        `should execute service 'sendArr'`,
        async () => {
          await expect(
            runRequest(
              `request runRequest/sendArr -d ${dataPathRel} -t ${targetName}`
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

      it(
        `should execute service sendObj`,
        async () => {
          await expect(
            runRequest(
              `request runRequest/sendObj -d ${dataPathRel} -t ${targetName}`
            )
          ).resolves.toEqual(true)

          const rawData = await readFile(`${process.projectDir}/output.json`)
          const output = JSON.parse(rawData)

          for (const tableName in sampleDataJson) {
            expect(output[tableName]).toEqual(expectedDataObj[tableName])
          }
        },
        60 * 1000
      )
    })
  })

  describe(`with useComputeApi: 'SAS Studio compute context'`, () => {
    describe(`having absolute path`, () => {
      it(
        `should execute service 'sendArr'`,
        async () => {
          await expect(
            runRequest(
              `request /Public/app/cli-tests/${targetName}-${timestampAppLoc}/runRequest/sendArr -d ${dataPathRel} -c ${configPathRel} -t ${targetName}`
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

      it(
        `should execute service 'sendObj'`,
        async () => {
          await expect(
            runRequest(
              `request /Public/app/cli-tests/${targetName}-${timestampAppLoc}/runRequest/sendObj -d ${dataPathRel} -c ${configPathRel} -t ${targetName}`
            )
          ).resolves.toEqual(true)

          const rawData = await readFile(`${process.projectDir}/output.json`)
          const output = JSON.parse(rawData)

          for (const tableName in sampleDataJson) {
            expect(output[tableName]).toEqual(expectedDataObj[tableName])
          }
        },
        60 * 1000
      )
    })

    describe(`with relative path`, () => {
      it(
        `should execute service 'sendArr'`,
        async () => {
          await expect(
            runRequest(
              `request runRequest/sendArr -d ${dataPathRel} -c ${configPathRel} -t ${targetName}`
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

      it(
        `should execute service 'sendObj'`,
        async () => {
          await expect(
            runRequest(
              `request runRequest/sendObj -d ${dataPathRel} -c ${configPathRel} -t ${targetName}`
            )
          ).resolves.toEqual(true)

          const rawData = await readFile(`${process.projectDir}/output.json`)
          const output = JSON.parse(rawData)

          for (const tableName in sampleDataJson) {
            expect(output[tableName]).toEqual(expectedDataObj[tableName])
          }
        },
        60 * 1000
      )
    })
  })

  afterAll(async (done) => {
    await deleteFolder('./test-app-request-*')
    await removeFromGlobalConfigs(targetName)

    await folder(`folder delete ${config.appLoc} -t ${targetName}`)
    done()
  }, 60 * 1000)
})

const createConfig = (targetName, timestamp) => ({
  name: targetName,
  serverType: process.env.SERVER_TYPE,
  serverUrl: process.env.SERVER_URL,
  appLoc: `/Public/app/cli-tests/${targetName}-${timestamp}`,
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
