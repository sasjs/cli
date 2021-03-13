import path from 'path'
import dotenv from 'dotenv'
import { compileBuildDeployServices } from '../../../main'
import { generateTimestamp } from '../../../utils/utils'
import {
  fileExists,
  readFile,
  readdir,
  folderExists,
  deleteFolder,
  deleteFile,
  copy
} from '../../../utils/file'
import { processFlow } from '..'
import { folder } from '../../folder'
import { createTestApp, removeTestApp } from '../../../utils/test'
import {
  removeFromGlobalConfig,
  saveToGlobalConfig
} from '../../../utils/config'
import examples from '../examples'
import { Command } from '../../../utils/command'
import { ServerType, Target } from '@sasjs/utils/types'
import { Logger, LogLevel } from '@sasjs/utils/logger'

describe('sasjs flow', () => {
  let target: Target
  const csvPath = path.join(__dirname, 'output.csv')
  const logPath = path.join(__dirname, 'logs')

  beforeAll(async (done) => {
    target = await createGlobalTarget()

    await createTestApp(__dirname, target.name)
    await copyJobsAndServices(target.name)
    await compileBuildDeployServices(new Command(`cbd -t ${target.name} -f`))

    process.logger = new Logger(LogLevel.Off)

    done()
  })

  afterEach(async (done) => {
    await deleteFolder(logPath)
    jest.resetAllMocks()
    done()
  })

  afterAll(async (done) => {
    await folder(
      new Command(
        `folder delete /Public/app/cli-tests/${target.name} -t ${target.name}`
      )
    )
    await deleteFile(csvPath)
    await removeTestApp(__dirname, target.name)
    await removeFromGlobalConfig(target.name)
    done()
  })

  it('should execute flow with 2 successful jobs', async (done) => {
    const sourcePath = path.join(__dirname, 'sourceFiles', 'testFlow_1.json')

    const command = new Command(
      `flow execute -s ${sourcePath} -t ${target.name} --csvFile ${csvPath} --logFolder ${logPath}`
    )

    await processFlow(command)

    await expect(fileExists(csvPath)).resolves.toEqual(true)
    await expect(folderExists(logPath)).resolves.toEqual(true)

    const csvData = (await readFile(csvPath)) as string

    const csvColumnsRegExp = new RegExp(
      '^id,Flow,Predecessors,Location,Status,Log location,Details'
    )
    const csvRowRegExp = new RegExp(
      `\\d,firstFlow,none,\/Public\/app\/cli-tests\/${target.name}\/jobs\/testJob\/job,completed,`,
      'gm'
    )

    expect((csvData.match(csvColumnsRegExp) || []).length).toEqual(1)
    expect((csvData.match(csvRowRegExp) || []).length).toEqual(2)

    done()
  })

  it(
    'should execute flow with job log having large log',
    async (done) => {
      const largeLogFileLines = 2000000

      const sourcePath = path.join(__dirname, 'sourceFiles', 'testFlow_8.json')

      const command = new Command(
        `flow execute -s ${sourcePath} -t ${target.name} --logFolder ${logPath}`
      )

      await processFlow(command)

      await expect(folderExists(logPath)).resolves.toEqual(true)
      const filesInLogFolder = await readdir(logPath)
      const logFilePath = path.join(logPath, filesInLogFolder[0])

      const content = await readFile(logFilePath)
      let count = 0
      for (let i = 0; i < content.length; i++) if (content[i] === '\n') count++

      expect(count).toBeGreaterThan(largeLogFileLines)

      done()
    },
    30 * 60 * 1000
  )

  it('should return an error if provided source file is not JSON', async (done) => {
    const sourcePath = path.join(__dirname, 'sourceFiles', 'not_valid.txt')

    const command = new Command(
      `flow execute -s ${sourcePath} -t ${target.name} --csvFile ${csvPath} --logFolder ${logPath}`
    )

    await expect(processFlow(command)).resolves.toEqual(
      `Please provide flow source (--source) file.\n${examples.command}`
    )

    done()
  })

  it('should return an error if provided source file does not exist', async (done) => {
    const sourcePath = path.join(
      __dirname,
      'sourceFiles',
      'does_not_exist.json'
    )

    const command = new Command(
      `flow execute -s ${sourcePath} -t ${target.name} --csvFile ${csvPath} --logFolder ${logPath}`
    )

    await expect(processFlow(command)).resolves.toEqual(
      `Source file does not exist.\n${examples.command}`
    )

    done()
  })

  it('should return an error if provided an invalid source file', async (done) => {
    const sourcePath = path.join(__dirname, 'sourceFiles', 'not_valid_1.json')

    const command = new Command(
      `flow execute -s ${sourcePath} -t ${target.name} --csvFile ${csvPath} --logFolder ${logPath}`
    )

    await expect(processFlow(command)).resolves.toEqual(examples.source)

    done()
  })

  it('should return an error if provided source file does not have flows property', async (done) => {
    const sourcePath = path.join(__dirname, 'sourceFiles', 'not_valid_2.json')

    const command = new Command(
      `flow execute -s ${sourcePath} -t ${target.name} --csvFile ${csvPath} --logFolder ${logPath}`
    )

    await expect(processFlow(command)).resolves.toEqual(examples.source)
    done()
  })

  it('should return an error if provided source file does not have jobs property', async (done) => {
    const sourcePath = path.join(__dirname, 'sourceFiles', 'not_valid_3.json')

    const command = new Command(
      `flow execute -s ${sourcePath} -t ${target.name} --csvFile ${csvPath} --logFolder ${logPath}`
    )

    await expect(processFlow(command)).resolves.toEqual(examples.source)

    done()
  })

  it('should execute flow with 2 successful jobs and 1 failing job', async (done) => {
    const sourcePath = path.join(__dirname, 'sourceFiles', 'testFlow_2.json')

    const command = new Command(
      `flow execute -s ${sourcePath} -t ${target.name} --csvFile ${csvPath} --logFolder ${logPath}`
    )

    await processFlow(command)

    const csvData = await readFile(csvPath)

    const csvColumnsRegExp = new RegExp(
      '^id,Flow,Predecessors,Location,Status,Log location,Details'
    )
    const csvRowCompletedRegExp = new RegExp(
      `\\d,firstFlow,none,\/Public\/app\/cli-tests\/${target.name}\/jobs\/testJob\/job,completed,`,
      'gm'
    )
    const csvRowFailedRegExp = new RegExp(
      `\\d,firstFlow,none,\/Public\/app\/cli-tests\/${target.name}\/jobs\/testJob\/failingJob,failure,`,
      'gm'
    )

    expect(csvData.match(csvColumnsRegExp).length).toEqual(1)
    expect(csvData.match(csvRowCompletedRegExp).length).toEqual(2)
    expect(csvData.match(csvRowFailedRegExp).length).toEqual(1)

    done()
  })

  it('should execute flow with 1 successful job and 1 job that does not exist', async (done) => {
    const sourcePath = path.join(__dirname, 'sourceFiles', 'testFlow_3.json')

    const command = new Command(
      `flow execute -s ${sourcePath} -t ${target.name} --csvFile ${csvPath} --logFolder ${logPath}`
    )

    jest.spyOn(process.logger, 'error')

    await processFlow(command)

    const csvData = await readFile(csvPath)

    const csvColumnsRegExp = new RegExp(
      '^id,Flow,Predecessors,Location,Status,Log location,Details'
    )
    const csvRowCompletedRegExp = new RegExp(
      `\\d,firstFlow,none,\/Public\/app\/cli-tests\/${target.name}\/jobs\/testJob\/job,completed,`,
      'gm'
    )
    const csvRowFailedRegExp = new RegExp(
      `\\d,firstFlow,none,\/Public\/app\/cli-tests\/${target.name}\/jobs\/testJob\/DOES_NOT_EXIST,failure,,Job was not found.`,
      'gm'
    )

    expect(csvData.match(csvColumnsRegExp).length).toEqual(1)
    expect(csvData.match(csvRowCompletedRegExp).length).toEqual(1)
    expect(csvData.match(csvRowFailedRegExp).length).toEqual(1)

    expect(process.logger.error).toHaveBeenNthCalledWith(
      1,
      "An error has occurred when executing 'firstFlow' flow's job located at: 'jobs/testJob/DOES_NOT_EXIST'. Job was not found."
    )

    done()
  })

  it(`should execute 2 chained flows with a failing job in predecessor's flow`, async (done) => {
    const sourcePath = path.join(__dirname, 'sourceFiles', 'testFlow_4.json')

    const command = new Command(
      `flow execute -s ${sourcePath} -t ${target.name} --csvFile ${csvPath} --logFolder ${logPath}`
    )

    await processFlow(command)

    const csvData = await readFile(csvPath)

    const csvColumnsRegExp = new RegExp(
      '^id,Flow,Predecessors,Location,Status,Log location,Details'
    )
    const csvRowCompletedRegExp = new RegExp(
      `\\d,firstFlow,none,\/Public\/app\/cli-tests\/${target.name}\/jobs\/testJob\/job,completed,`,
      'gm'
    )
    const csvRowFailedRegExp = new RegExp(
      `\\d,firstFlow,none,\/Public\/app\/cli-tests\/${target.name}\/jobs\/testJob\/failingJob,failure,`,
      'gm'
    )

    expect(csvData.match(csvColumnsRegExp).length).toEqual(1)
    expect(csvData.match(csvRowCompletedRegExp).length).toEqual(1)
    expect(csvData.match(csvRowFailedRegExp).length).toEqual(1)

    done()
  })

  it(`should execute 2 chained flows with a failing job in successor's flow`, async (done) => {
    const sourcePath = path.join(__dirname, 'sourceFiles', 'testFlow_5.json')

    const command = new Command(
      `flow execute -s ${sourcePath} -t ${target.name} --csvFile ${csvPath} --logFolder ${logPath}`
    )

    await processFlow(command)

    const csvData = await readFile(csvPath)

    const csvColumnsRegExp = new RegExp(
      '^id,Flow,Predecessors,Location,Status,Log location,Details'
    )
    const csvRowFirstFlowCompletedRegExp = new RegExp(
      `\\d,firstFlow,none,\/Public\/app\/cli-tests\/${target.name}\/jobs\/testJob\/job,completed,`,
      'gm'
    )
    const csvRowSecondFlowCompletedRegExp = new RegExp(
      `\\d,secondFlow,firstFlow,\/Public\/app\/cli-tests\/${target.name}\/jobs\/testJob\/job,completed,`,
      'gm'
    )
    const csvRowFailedRegExp = new RegExp(
      `\\d,secondFlow,firstFlow,\/Public\/app\/cli-tests\/${target.name}\/jobs\/testJob\/failingJob,failure,`,
      'gm'
    )

    expect(csvData.match(csvColumnsRegExp).length).toEqual(1)
    expect(csvData.match(csvRowFirstFlowCompletedRegExp).length).toEqual(2)
    expect(csvData.match(csvRowSecondFlowCompletedRegExp).length).toEqual(1)
    expect(csvData.match(csvRowFailedRegExp).length).toEqual(1)

    done()
  })

  it(`should execute 3 chained flows with a failing job in one of the predecessor's flow`, async (done) => {
    const sourcePath = path.join(__dirname, 'sourceFiles', 'testFlow_6.json')

    const command = new Command(
      `flow execute -s ${sourcePath} -t ${target.name} --csvFile ${csvPath} --logFolder ${logPath}`
    )

    await processFlow(command)

    const csvData = await readFile(csvPath)

    const csvColumnsRegExp = new RegExp(
      '^id,Flow,Predecessors,Location,Status,Log location,Details'
    )
    const csvRowFirstFlowCompletedRegExp = new RegExp(
      `\\d,firstFlow,none,\/Public\/app\/cli-tests\/${target.name}\/jobs\/testJob\/job,completed,`,
      'gm'
    )
    const csvRowFailedRegExp = new RegExp(
      `\\d,secondFlow,firstFlow,\/Public\/app\/cli-tests\/${target.name}\/jobs\/testJob\/failingJob,failure,`,
      'gm'
    )

    expect(csvData.match(csvColumnsRegExp).length).toEqual(1)
    expect(csvData.match(csvRowFirstFlowCompletedRegExp).length).toEqual(2)
    expect(csvData.match(csvRowFailedRegExp).length).toEqual(1)

    done()
  })

  it(`should execute 6 chained flows with failing and succeeding jobs`, async (done) => {
    const sourcePath = path.join(__dirname, 'sourceFiles', 'testFlow_7.json')

    const command = new Command(
      `flow execute -s ${sourcePath} -t ${target.name} --csvFile ${csvPath} --logFolder ${logPath}`
    )

    await processFlow(command)

    const csvData = await readFile(csvPath)

    const csvColumnsRegExp = new RegExp(
      '^id,Flow,Predecessors,Location,Status,Log location,Details'
    )
    const csvRowFirstFlowCompletedRegExp = new RegExp(
      `\\d,firstFlow,none,\/Public\/app\/cli-tests\/${target.name}\/jobs\/testJob\/job,completed,`,
      'gm'
    )
    const csvRowSecondFlowCompletedRegExp = new RegExp(
      `\\d,secondFlow,firstFlow,\/Public\/app\/cli-tests\/${target.name}\/jobs\/testJob\/job,completed,`,
      'gm'
    )
    const csvRowThirdFlowCompletedRegExp = new RegExp(
      `\\d,thirdFlow,firstFlow \\| secondFlow,\/Public\/app\/cli-tests\/${target.name}\/jobs\/testJob\/job,completed,`,
      'gm'
    )
    const csvRowThirdFlowFailedRegExp = new RegExp(
      `\\d,thirdFlow,firstFlow \\| secondFlow,\/Public\/app\/cli-tests\/${target.name}\/jobs\/testJob\/failingJob,failure,`,
      'gm'
    )
    const csvRowFourthFlowCompletedRegExp = new RegExp(
      `\\d,fourthFlow,secondFlow,\/Public\/app\/cli-tests\/${target.name}\/jobs\/testJob\/job,completed,`,
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

    done()
  })

  it('should execute flow and create csv file in default location', async (done) => {
    const sourcePath = path.join(__dirname, 'sourceFiles', 'testFlow_1.json')
    const csvLoc = path.join(
      __dirname,
      target.name,
      'sasjsbuild',
      'flowResults.csv'
    )

    const command = new Command(
      `flow execute -s ${sourcePath} --logFolder ${logPath} -t ${target.name}`
    )

    await processFlow(command)

    await expect(fileExists(csvLoc)).resolves.toEqual(true)

    const csvData = (await readFile(csvLoc)) as string

    const csvColumnsRegExp = new RegExp(
      '^id,Flow,Predecessors,Location,Status,Log location,Details'
    )
    const csvRowRegExp = new RegExp(
      `\\d,firstFlow,none,\/Public\/app\/cli-tests\/${target.name}\/jobs\/testJob\/job,completed,`,
      'gm'
    )

    expect((csvData.match(csvColumnsRegExp) || []).length).toEqual(1)
    expect((csvData.match(csvRowRegExp) || []).length).toEqual(2)

    done()
  })
})

const createGlobalTarget = async () => {
  dotenv.config()
  const timestamp = generateTimestamp()
  const targetName = `cli-tests-flow-${timestamp}`

  const serverType: ServerType =
    process.env.SERVER_TYPE === ServerType.SasViya
      ? ServerType.SasViya
      : ServerType.Sas9
  const target = new Target({
    name: targetName,
    serverType,
    serverUrl: process.env.SERVER_URL as string,
    appLoc: `/Public/app/cli-tests/${targetName}`,
    serviceConfig: {
      serviceFolders: ['sasjs/testServices', 'sasjs/testJob', 'sasjs/services'],
      initProgram: 'sasjs/testServices/serviceinit.sas',
      termProgram: 'sasjs/testServices/serviceterm.sas',
      macroVars: {}
    },
    jobConfig: {
      jobFolders: ['sasjs/testJob'],
      initProgram: 'sasjs/testServices/serviceinit.sas',
      termProgram: 'sasjs/testServices/serviceterm.sas',
      macroVars: {}
    },
    authConfig: {
      client: process.env.CLIENT as string,
      secret: process.env.SECRET as string,
      access_token: process.env.ACCESS_TOKEN as string,
      refresh_token: process.env.REFRESH_TOKEN as string
    },
    deployConfig: {
      deployServicePack: true,
      deployScripts: []
    }
  })
  await saveToGlobalConfig(target)
  return target
}

const copyJobsAndServices = async (appName: string) => {
  await copy(
    path.join(__dirname, 'testJob'),
    path.join(__dirname, appName, 'sasjs', 'testJob')
  )
  await copy(
    path.join(__dirname, 'testServices'),
    path.join(__dirname, appName, 'sasjs', 'testServices')
  )
}
