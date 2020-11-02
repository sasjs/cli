import dotenv from 'dotenv'
import path from 'path'
import fs from 'fs'
import { runRequest, compileBuildDeployServices } from '../../../src/main'
import {
  createFolder,
  deleteFolder,
  createFile
} from '../../../src/utils/file-utils'

describe('sasjs request', () => {
  const testingAppFolder = 'cli-tests-request'
  const projectDirPath = path.join(process.cwd(), testingAppFolder)

  const dataPath = path.join(projectDirPath, 'data.json')
  const configPath = path.join(projectDirPath, 'sasjsconfig-temp.json')

  const dataPathRel = `${testingAppFolder}/data.json`
  const configPathRel = `${testingAppFolder}/sasjsconfig-temp.json`

  const sampleDataJson = {
    table1: [
      { col1: 'first col value1', col2: 'second col value1' },
      { col1: 'first col value2', col2: 'second col value2' }
    ],
    table2: [{ col1: 'first col value' }]
  }

  const targetName = 'cli-tests-request'

  beforeAll(async () => {
    dotenv.config()
    process.projectDir = path.join(process.cwd())

    const config = {
      name: targetName,
      serverType: process.env.SERVER_TYPE,
      serverUrl: process.env.SERVER_URL,
      appLoc: '/Public/app/cli-tests',
      useComputeApi: true,
      contextName: 'SAS Studio compute context', // FIXME: should not be hardcoded
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
    }

    await addToGlobalConfigs(config)

    const command = `cbd ${targetName} -f`.split(' ')
    await compileBuildDeployServices(command)

    const sasjsBuildDirPath = path.join(process.projectDir, 'sasjsbuild')
    await deleteFolder(sasjsBuildDirPath)

    await deleteFolder(projectDirPath)
    await createFolder(projectDirPath)
    await createFile(configPath, JSON.stringify(config, null, 2))
    await createFile(dataPath, JSON.stringify(sampleDataJson, null, 2))
  }, 60 * 1000)

  describe(`with default config`, () => {
    describe(`having absolute path`, () => {
      it(
        `should execute service 'sendArr'`,
        async () => {
          await expect(
            runRequest(
              '/Public/app/cli-tests/runRequest/sendArr',
              dataPathRel,
              'default',
              targetName
            )
          ).resolves.toEqual(true)

          const rawData = fs.readFileSync('output.json')
          const output = JSON.parse(rawData)

          for (const tableName in sampleDataJson) {
            expect(output[tableName]).toEqual(expect.anything())
          }
        },
        60 * 1000
      )

      it(
        `should execute service 'sendObj'`,
        async () => {
          await expect(
            runRequest(
              '/Public/app/cli-tests/runRequest/sendObj',
              dataPathRel,
              'default',
              targetName
            )
          ).resolves.toEqual(true)

          const rawData = fs.readFileSync('output.json')
          const output = JSON.parse(rawData)

          for (const tableName in sampleDataJson) {
            expect(output[tableName]).toEqual(expect.anything())
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
            runRequest('runRequest/sendArr', dataPathRel, 'default', targetName)
          ).resolves.toEqual(true)

          const rawData = fs.readFileSync('output.json')
          const output = JSON.parse(rawData)

          for (const tableName in sampleDataJson) {
            expect(output[tableName]).toEqual(expect.anything())
          }
        },
        60 * 1000
      )

      it(
        `should execute service sendObj`,
        async () => {
          await expect(
            runRequest('runRequest/sendObj', dataPathRel, 'default', targetName)
          ).resolves.toEqual(true)

          const rawData = fs.readFileSync('output.json')
          const output = JSON.parse(rawData)

          for (const tableName in sampleDataJson) {
            expect(output[tableName]).toEqual(expect.anything())
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
              '/Public/app/cli-tests/runRequest/sendArr',
              dataPathRel,
              configPathRel,
              targetName
            )
          ).resolves.toEqual(true)

          const rawData = fs.readFileSync('output.json')
          const output = JSON.parse(rawData)

          for (const tableName in sampleDataJson) {
            expect(output[tableName]).toEqual(expect.anything())
          }
        },
        60 * 1000
      )

      it(
        `should execute service 'sendObj'`,
        async () => {
          await expect(
            runRequest(
              '/Public/app/cli-tests/runRequest/sendObj',
              dataPathRel,
              configPathRel,
              targetName
            )
          ).resolves.toEqual(true)

          const rawData = fs.readFileSync('output.json')
          const output = JSON.parse(rawData)

          for (const tableName in sampleDataJson) {
            expect(output[tableName]).toEqual(expect.anything())
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
              'runRequest/sendArr',
              dataPathRel,
              configPathRel,
              targetName
            )
          ).resolves.toEqual(true)

          const rawData = fs.readFileSync('output.json')
          const output = JSON.parse(rawData)

          for (const tableName in sampleDataJson) {
            expect(output[tableName]).toEqual(expect.anything())
          }
        },
        60 * 1000
      )

      it(
        `should execute service 'sendObj'`,
        async () => {
          await expect(
            runRequest(
              'runRequest/sendObj',
              dataPathRel,
              configPathRel,
              targetName
            )
          ).resolves.toEqual(true)

          const rawData = fs.readFileSync('output.json')
          const output = JSON.parse(rawData)

          for (const tableName in sampleDataJson) {
            expect(output[tableName]).toEqual(expect.anything())
          }
        },
        60 * 1000
      )
    })
  })

  afterEach(async () => {
    const outputFilePath = path.join(process.projectDir, 'output.json')
    console.log('Removing output.json')
    await deleteFolder(outputFilePath)
    console.log('Removed output.json')
  }, 60 * 1000)

  afterAll(async () => {
    await deleteFolder(projectDirPath)
    await removeFromGlobalConfigs(targetName)
  }, 60 * 1000)
})
