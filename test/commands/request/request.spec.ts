import dotenv from 'dotenv'
import path from 'path'
import { readFile } from '../../../src/utils/file'
import { generateTimestamp } from '../../../src/utils/utils'
import { runRequest, compileBuildDeployServices } from '../../../src/main'
import { createFolder, deleteFolder, createFile } from '../../../src/utils/file'
import { folder } from '../../../src/commands/folder/index'
import { ServerType, Target } from '@sasjs/utils/types'

describe('sasjs request', () => {
  let config: Target
  const timestampAppLoc = generateTimestamp()
  const targetName = `cli-tests-request-${timestampAppLoc}`
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

  beforeAll(async (done) => {
    dotenv.config()

    config = createConfig(targetName)

    await addToGlobalConfigs(config)

    const cbdFolderName = `cbd-for-request-${generateTimestamp()}`

    await setupFolderForTesting(cbdFolderName)

    const command = `cbd ${targetName} -f`.split(' ')
    await expect(compileBuildDeployServices(command)).resolves.toEqual(true)

    const cbdFolderPath = path.join(process.cwd(), cbdFolderName)
    await deleteFolder(cbdFolderPath)

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
              `request /Public/app/cli-tests/${targetName}/runRequest/sendArr -d ${dataPathRel} -t ${targetName}`
            )
          ).resolves.toEqual(true)
          const rawData = await readFile(`${process.projectDir}/output.json`)
          const output = JSON.parse(rawData)

          expect(output.table1).toEqual(expectedDataArr.table1)
          expect(output.table2).toEqual(expectedDataArr.table2)
        },
        60 * 1000
      )

      it(
        `should execute service 'sendObj'`,
        async () => {
          await expect(
            runRequest(
              `request /Public/app/cli-tests/${targetName}/runRequest/sendObj -d ${dataPathRel} -t ${targetName}`
            )
          ).resolves.toEqual(true)
          const rawData = await readFile(`${process.projectDir}/output.json`)
          const output = JSON.parse(rawData)

          expect(output.table1).toEqual(expectedDataObj.table1)
          expect(output.table2).toEqual(expectedDataObj.table2)
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

          expect(output.table1).toEqual(expectedDataArr.table1)
          expect(output.table2).toEqual(expectedDataArr.table2)
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

          expect(output.table1).toEqual(expectedDataObj.table1)
          expect(output.table2).toEqual(expectedDataObj.table2)
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
              `request /Public/app/cli-tests/${targetName}/runRequest/sendArr -d ${dataPathRel} -c ${configPathRel} -t ${targetName}`
            )
          ).resolves.toEqual(true)

          const rawData = await readFile(`${process.projectDir}/output.json`)
          const output = JSON.parse(rawData)

          expect(output.table1).toEqual(expectedDataArr.table1)
          expect(output.table2).toEqual(expectedDataArr.table2)
        },
        60 * 1000
      )

      it(
        `should execute service 'sendObj'`,
        async () => {
          await expect(
            runRequest(
              `request /Public/app/cli-tests/${targetName}/runRequest/sendObj -d ${dataPathRel} -c ${configPathRel} -t ${targetName}`
            )
          ).resolves.toEqual(true)

          const rawData = await readFile(`${process.projectDir}/output.json`)
          const output = JSON.parse(rawData)

          expect(output.table1).toEqual(expectedDataObj.table1)
          expect(output.table2).toEqual(expectedDataObj.table2)
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

          expect(output.table1).toEqual(expectedDataArr.table1)
          expect(output.table2).toEqual(expectedDataArr.table2)
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

          expect(output.table1).toEqual(expectedDataObj.table1)
          expect(output.table2).toEqual(expectedDataObj.table2)
        },
        60 * 1000
      )
    })
  })

  afterAll(async (done) => {
    await deleteFolder('./test-app-request-*')
    await folder(`folder delete ${config.appLoc} -t ${targetName}`)

    await removeFromGlobalConfigs(targetName)
    done()
  }, 60 * 1000)
})

const createConfig = (targetName: string): Target => {
  const serverType: ServerType =
    process.env.SERVER_TYPE === ServerType.SasViya
      ? ServerType.SasViya
      : ServerType.Sas9
  return {
    name: targetName,
    serverType: serverType,
    serverUrl: process.env.SERVER_URL as string,
    appLoc: `/Public/app/cli-tests/${targetName}`,
    useComputeApi: true,
    contextName: 'SAS Studio compute context', // FIXME: should not be hard coded
    tgtServices: ['../../test/commands/request/runRequest'],
    authInfo: {
      client: process.env.CLIENT as string,
      secret: process.env.SECRET as string,
      access_token: process.env.ACCESS_TOKEN as string,
      refresh_token: process.env.REFRESH_TOKEN as string
    },
    tgtDeployVars: {
      client: process.env.CLIENT as string,
      secret: process.env.SECRET as string
    },
    deployServicePack: true,
    tgtDeployScripts: []
  }
}
