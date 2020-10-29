import dotenv from 'dotenv'
import path from 'path'
import fs from 'fs'

import { saveGlobalRcFile } from '../../../src/utils/config-utils'
import { runRequest, compileBuildDeployServices } from '../../../src/main'
import {
  createFolder,
  deleteFolder,
  createFile
} from '../../../src/utils/file-utils'

describe('sasjs request', () => {
  const testingAppFolder = 'testing-apps'
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

  beforeAll(async () => {
    dotenv.config()
    process.projectDir = path.join(process.cwd())
    const config = {
      name: 'cli-tests',
      serverType: 'SASVIYA',
      serverUrl: 'https://sas.analytium.co.uk',
      appLoc: '/Public/app/cli-tests',
      useComputeApi: true,
      contextName: 'SAS Studio compute context',
      tgtServices: ['../test/commands/request/runRequest'],
      authInfo: {
        client: process.env.client,
        secret: process.env.secret,
        access_token: process.env.access_token,
        refresh_token: process.env.refresh_token
      },
      deployServicePack: true,
      tgtDeployScripts: []
    }
    await saveGlobalRcFile(
      JSON.stringify({
        targets: [config]
      })
    )

    const command = 'cbd cli-tests -f'.split(' ')
    await compileBuildDeployServices(command)

    await deleteFolder(projectDirPath)
    await createFolder(projectDirPath)
    await createFile(configPath, JSON.stringify(config, null, 2))
    await createFile(dataPath, JSON.stringify(sampleDataJson, null, 2))
  }, 60 * 1000)

  describe(`with default config`, () => {
    describe(`having absolute path`, () => {
      it(
        `executing service sendArr`,
        async () => {
          await expect(
            runRequest(
              '/Public/app/cli-tests/runRequest/sendArr',
              dataPathRel,
              'default'
            )
          ).resolves.toEqual(true)

          const rawdata = fs.readFileSync('output.json')
          const output = JSON.parse(rawdata)

          for (const tableName in sampleDataJson) {
            expect(output[tableName]).toEqual(expect.anything())
          }
        },
        60 * 1000
      )
      it(
        `executing service sendObj`,
        async () => {
          await expect(
            runRequest(
              '/Public/app/cli-tests/runRequest/sendObj',
              dataPathRel,
              'default'
            )
          ).resolves.toEqual(true)

          const rawdata = fs.readFileSync('output.json')
          const output = JSON.parse(rawdata)

          for (const tableName in sampleDataJson) {
            expect(output[tableName]).toEqual(expect.anything())
          }
        },
        60 * 1000
      )
    })
    describe(`having relative path`, () => {
      it(
        `executing service sendArr`,
        async () => {
          await expect(
            runRequest('runRequest/sendArr', dataPathRel, 'default')
          ).resolves.toEqual(true)

          const rawdata = fs.readFileSync('output.json')
          const output = JSON.parse(rawdata)

          for (const tableName in sampleDataJson) {
            expect(output[tableName]).toEqual(expect.anything())
          }
        },
        60 * 1000
      )
      it(
        `executing service sendObj`,
        async () => {
          await expect(
            runRequest('runRequest/sendObj', dataPathRel, 'default')
          ).resolves.toEqual(true)

          const rawdata = fs.readFileSync('output.json')
          const output = JSON.parse(rawdata)

          for (const tableName in sampleDataJson) {
            expect(output[tableName]).toEqual(expect.anything())
          }
        },
        60 * 1000
      )
    })
  })
  describe(`with useComputeApi: SAS Studio compute context`, () => {
    describe(`having absolute path`, () => {
      it(
        `executing service sendArr`,
        async () => {
          await expect(
            runRequest(
              '/Public/app/cli-tests/runRequest/sendArr',
              dataPathRel,
              configPathRel
            )
          ).resolves.toEqual(true)

          const rawdata = fs.readFileSync('output.json')
          const output = JSON.parse(rawdata)

          for (const tableName in sampleDataJson) {
            expect(output[tableName]).toEqual(expect.anything())
          }
        },
        60 * 1000
      )
      it(
        `executing service sendObj`,
        async () => {
          await expect(
            runRequest(
              '/Public/app/cli-tests/runRequest/sendObj',
              dataPathRel,
              configPathRel
            )
          ).resolves.toEqual(true)

          const rawdata = fs.readFileSync('output.json')
          const output = JSON.parse(rawdata)

          for (const tableName in sampleDataJson) {
            expect(output[tableName]).toEqual(expect.anything())
          }
        },
        60 * 1000
      )
    })
    describe(`having relative path`, () => {
      it(
        `executing service sendArr`,
        async () => {
          await expect(
            runRequest('runRequest/sendArr', dataPathRel, configPathRel)
          ).resolves.toEqual(true)

          const rawdata = fs.readFileSync('output.json')
          const output = JSON.parse(rawdata)

          for (const tableName in sampleDataJson) {
            expect(output[tableName]).toEqual(expect.anything())
          }
        },
        60 * 1000
      )
      it(
        `executing service sendObj`,
        async () => {
          await expect(
            runRequest('runRequest/sendObj', dataPathRel, configPathRel)
          ).resolves.toEqual(true)

          const rawdata = fs.readFileSync('output.json')
          const output = JSON.parse(rawdata)

          for (const tableName in sampleDataJson) {
            expect(output[tableName]).toEqual(expect.anything())
          }
        },
        60 * 1000
      )
    })
  })
})
