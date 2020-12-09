import path from 'path'
import dotenv from 'dotenv'
import { compileBuildDeployServices } from '../../../src/main'
import { generateTimestamp } from '../../../src/utils/utils'
import {
  fileExists,
  readFile,
  folderExists,
  deleteFolder,
  deleteFile
} from '../../../src/utils/file'
import { processFlow } from '../../../src/commands'
import { folder } from '../../../src/commands/folder'

describe('sasjs flow', () => {
  const cwd = process.cwd()
  const csvPath = path.join(cwd, 'test/commands/flow/output.csv')
  const logPath = path.join(cwd, 'test/commands/flow/logs')
  const targetName = 'cli-tests-flow-' + generateTimestamp()

  beforeAll(async () => {
    ;(process as any).projectDir = path.join(process.cwd())
    dotenv.config()

    await (global as any).addToGlobalConfigs({
      name: targetName,
      serverType: process.env.SERVER_TYPE,
      serverUrl: process.env.SERVER_URL,
      appLoc: `/Public/app/cli-tests/${targetName}`,
      authInfo: {
        client: process.env.CLIENT,
        secret: process.env.SECRET,
        access_token: process.env.ACCESS_TOKEN,
        refresh_token: process.env.REFRESH_TOKEN
      },
      jobs: ['../test/commands/cbd/testJob'],
      deployServicePack: true
    })

    await compileBuildDeployServices(`cbd ${targetName} -f`)
  }, 60 * 1000)

  describe('execute', () => {
    it(
      'should execute flow with 2 successful jobs',
      async () => {
        const sourcePath = path.join(
          cwd,
          'test/commands/flow/sourceFiles/testFlow_1.json'
        )

        const command = `flow execute -s ${sourcePath} -t ${targetName} --csvFile ${csvPath} --logFolder ${logPath}`

        await processFlow(command)

        await expect(fileExists(csvPath)).resolves.toEqual(true)
        await expect(folderExists(logPath)).resolves.toEqual(true)

        const csvData = await readFile(csvPath)

        const csvColumnsRegExp = new RegExp(
          '^id,Flow,Predecessors,Location,Status,Log location,Details'
        )
        const csvRowRegExp = new RegExp(
          `\\d,firstFlow,none,\/Public\/app\/cli-tests\/${targetName}\/jobs\/testJob\/job,completed,`,
          'gm'
        )

        expect(csvData.match(csvColumnsRegExp).length).toEqual(1)
        expect(csvData.match(csvRowRegExp).length).toEqual(2)
      },
      60 * 1000
    )

    it(
      'should execute flow with 2 successful jobs and 1 failing job',
      async () => {
        const sourcePath = path.join(
          cwd,
          'test/commands/flow/sourceFiles/testFlow_2.json'
        )

        const command = `flow execute -s ${sourcePath} -t ${targetName} --csvFile ${csvPath} --logFolder ${logPath}`

        await processFlow(command)

        const csvData = await readFile(csvPath)

        const csvColumnsRegExp = new RegExp(
          '^id,Flow,Predecessors,Location,Status,Log location,Details'
        )
        const csvRowCompletedRegExp = new RegExp(
          `\\d,firstFlow,none,\/Public\/app\/cli-tests\/${targetName}\/jobs\/testJob\/job,completed,`,
          'gm'
        )
        const csvRowFailedRegExp = new RegExp(
          `\\d,firstFlow,none,\/Public\/app\/cli-tests\/${targetName}\/jobs\/testJob\/failingJob,failure,`,
          'gm'
        )

        expect(csvData.match(csvColumnsRegExp).length).toEqual(1)
        expect(csvData.match(csvRowCompletedRegExp).length).toEqual(2)
        expect(csvData.match(csvRowFailedRegExp).length).toEqual(1)
      },
      60 * 1000
    )

    it(
      'should execute flow with 1 successful job and 1 job that does not exist',
      async () => {
        const sourcePath = path.join(
          cwd,
          'test/commands/flow/sourceFiles/testFlow_3.json'
        )

        const command = `flow execute -s ${sourcePath} -t ${targetName} --csvFile ${csvPath} --logFolder ${logPath}`

        await processFlow(command)

        const csvData = await readFile(csvPath)

        const csvColumnsRegExp = new RegExp(
          '^id,Flow,Predecessors,Location,Status,Log location,Details'
        )
        const csvRowCompletedRegExp = new RegExp(
          `\\d,firstFlow,none,\/Public\/app\/cli-tests\/${targetName}\/jobs\/testJob\/job,completed,`,
          'gm'
        )
        const csvRowFailedRegExp = new RegExp(
          `\\d,firstFlow,none,\/Public\/app\/cli-tests\/${targetName}\/jobs\/testJob\/DOES_NOT_EXIST,failure,,Job was not found.`,
          'gm'
        )

        expect(csvData.match(csvColumnsRegExp).length).toEqual(1)
        expect(csvData.match(csvRowCompletedRegExp).length).toEqual(1)
        expect(csvData.match(csvRowFailedRegExp).length).toEqual(1)
      },
      60 * 1000
    )

    it(
      `should execute 2 chained flows with a failing job in predecessor's flow`,
      async () => {
        const sourcePath = path.join(
          cwd,
          'test/commands/flow/sourceFiles/testFlow_4.json'
        )

        const command = `flow execute -s ${sourcePath} -t ${targetName} --csvFile ${csvPath} --logFolder ${logPath}`

        await processFlow(command)

        const csvData = await readFile(csvPath)

        const csvColumnsRegExp = new RegExp(
          '^id,Flow,Predecessors,Location,Status,Log location,Details'
        )
        const csvRowCompletedRegExp = new RegExp(
          `\\d,firstFlow,none,\/Public\/app\/cli-tests\/${targetName}\/jobs\/testJob\/job,completed,`,
          'gm'
        )
        const csvRowFailedRegExp = new RegExp(
          `\\d,firstFlow,none,\/Public\/app\/cli-tests\/${targetName}\/jobs\/testJob\/failingJob,failure,`,
          'gm'
        )

        expect(csvData.match(csvColumnsRegExp).length).toEqual(1)
        expect(csvData.match(csvRowCompletedRegExp).length).toEqual(1)
        expect(csvData.match(csvRowFailedRegExp).length).toEqual(1)
      },
      60 * 1000
    )

    it(
      `should execute 2 chained flows with a failing job in successor's flow`,
      async () => {
        const sourcePath = path.join(
          cwd,
          'test/commands/flow/sourceFiles/testFlow_5.json'
        )

        const command = `flow execute -s ${sourcePath} -t ${targetName} --csvFile ${csvPath} --logFolder ${logPath}`

        await processFlow(command)

        const csvData = await readFile(csvPath)

        const csvColumnsRegExp = new RegExp(
          '^id,Flow,Predecessors,Location,Status,Log location,Details'
        )
        const csvRowFirstFlowCompletedRegExp = new RegExp(
          `\\d,firstFlow,none,\/Public\/app\/cli-tests\/${targetName}\/jobs\/testJob\/job,completed,`,
          'gm'
        )
        const csvRowSecondFlowCompletedRegExp = new RegExp(
          `\\d,secondFlow,firstFlow,\/Public\/app\/cli-tests\/${targetName}\/jobs\/testJob\/job,completed,`,
          'gm'
        )
        const csvRowFailedRegExp = new RegExp(
          `\\d,secondFlow,firstFlow,\/Public\/app\/cli-tests\/${targetName}\/jobs\/testJob\/failingJob,failure,`,
          'gm'
        )

        expect(csvData.match(csvColumnsRegExp).length).toEqual(1)
        expect(csvData.match(csvRowFirstFlowCompletedRegExp).length).toEqual(2)
        expect(csvData.match(csvRowSecondFlowCompletedRegExp).length).toEqual(1)
        expect(csvData.match(csvRowFailedRegExp).length).toEqual(1)
      },
      60 * 1000
    )

    it(
      `should execute 3 chained flows with a failing job in one of the predecessor's flow`,
      async () => {
        const sourcePath = path.join(
          cwd,
          'test/commands/flow/sourceFiles/testFlow_6.json'
        )

        const command = `flow execute -s ${sourcePath} -t ${targetName} --csvFile ${csvPath} --logFolder ${logPath}`

        await processFlow(command)

        const csvData = await readFile(csvPath)

        const csvColumnsRegExp = new RegExp(
          '^id,Flow,Predecessors,Location,Status,Log location,Details'
        )
        const csvRowFirstFlowCompletedRegExp = new RegExp(
          `\\d,firstFlow,none,\/Public\/app\/cli-tests\/${targetName}\/jobs\/testJob\/job,completed,`,
          'gm'
        )
        const csvRowFailedRegExp = new RegExp(
          `\\d,secondFlow,firstFlow,\/Public\/app\/cli-tests\/${targetName}\/jobs\/testJob\/failingJob,failure,`,
          'gm'
        )

        expect(csvData.match(csvColumnsRegExp).length).toEqual(1)
        expect(csvData.match(csvRowFirstFlowCompletedRegExp).length).toEqual(2)
        expect(csvData.match(csvRowFailedRegExp).length).toEqual(1)
      },
      60 * 1000
    )

    it(
      `should execute 6 chained flows with failing and succeeding jobs`,
      async () => {
        const sourcePath = path.join(
          cwd,
          'test/commands/flow/sourceFiles/testFlow_7.json'
        )

        const command = `flow execute -s ${sourcePath} -t ${targetName} --csvFile ${csvPath} --logFolder ${logPath}`

        await processFlow(command)

        const csvData = await readFile(csvPath)

        const csvColumnsRegExp = new RegExp(
          '^id,Flow,Predecessors,Location,Status,Log location,Details'
        )
        const csvRowFirstFlowCompletedRegExp = new RegExp(
          `\\d,firstFlow,none,\/Public\/app\/cli-tests\/${targetName}\/jobs\/testJob\/job,completed,`,
          'gm'
        )
        const csvRowSecondFlowCompletedRegExp = new RegExp(
          `\\d,secondFlow,firstFlow,\/Public\/app\/cli-tests\/${targetName}\/jobs\/testJob\/job,completed,`,
          'gm'
        )
        const csvRowThirdFlowCompletedRegExp = new RegExp(
          `\\d,thirdFlow,firstFlow \\| secondFlow,\/Public\/app\/cli-tests\/${targetName}\/jobs\/testJob\/job,completed,`,
          'gm'
        )
        const csvRowThirdFlowFailedRegExp = new RegExp(
          `\\d,thirdFlow,firstFlow \\| secondFlow,\/Public\/app\/cli-tests\/${targetName}\/jobs\/testJob\/failingJob,failure,`,
          'gm'
        )
        const csvRowFourthFlowCompletedRegExp = new RegExp(
          `\\d,fourthFlow,secondFlow,\/Public\/app\/cli-tests\/${targetName}\/jobs\/testJob\/job,completed,`,
          'gm'
        )
        const csvRowSixthFlowCompletedRegExp = new RegExp(
          `\\d,sixFlow,none,\/Public\/app\/cli-tests\/${targetName}\/jobs\/testJob\/job,completed,`,
          'gm'
        )
        const csvRowFailedRegExp = new RegExp(`fifthFlow`, 'gm')

        expect(csvData.match(csvColumnsRegExp).length).toEqual(1)
        expect(csvData.match(csvRowFirstFlowCompletedRegExp).length).toEqual(2)
        expect(csvData.match(csvRowSecondFlowCompletedRegExp).length).toEqual(1)
        expect(csvData.match(csvRowThirdFlowCompletedRegExp).length).toEqual(1)
        expect(csvData.match(csvRowThirdFlowFailedRegExp).length).toEqual(1)
        expect(csvData.match(csvRowFourthFlowCompletedRegExp).length).toEqual(1)
        expect(csvData.match(csvRowFailedRegExp)).toEqual(null)
      },
      60 * 1000
    )
  })

  afterAll(async () => {
    await folder(
      `folder delete /Public/app/cli-tests/${targetName} -t ${targetName}`
    )
    await deleteFile(csvPath)
    await deleteFolder(logPath)
    await deleteFolder(path.join(cwd, 'sasjsbuild'))

    await (global as any).removeFromGlobalConfigs(targetName)
  })
})
