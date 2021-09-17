import path from 'path'
import dotenv from 'dotenv'
import {
  fileExists,
  readFile,
  listFilesInFolder,
  folderExists,
  deleteFolder,
  deleteFile,
  copy,
  AuthConfig
} from '@sasjs/utils'
import {
  createTestApp,
  removeTestApp,
  removeTestServerFolder
} from '../../../utils/test'
import { getAuthConfig, removeFromGlobalConfig } from '../../../utils/config'
import examples from '../internal/examples'
import {
  ServerType,
  Target,
  Logger,
  LogLevel,
  generateTimestamp
} from '@sasjs/utils'
import { contextName } from '../../../utils'
import { build, deploy } from '../..'
import { execute } from '../execute'
import SASjs from '@sasjs/adapter/node'

describe('sasjs flow', () => {
  const target: Target = generateTarget()
  const sasjs: SASjs = new SASjs({
    serverUrl: target.serverUrl,
    allowInsecureRequests: target.allowInsecureRequests,
    appLoc: target.appLoc,
    serverType: target.serverType
  })
  let authConfig: AuthConfig
  const csvPath = path.join(__dirname, 'output.csv')
  const logPath = path.join(__dirname, 'logs')

  beforeAll(async () => {
    authConfig = await getAuthConfig(target)

    await createTestApp(__dirname, target.name)
    await copyJobsAndServices(target.name)
    await build(target)
    await deploy(target, false)

    process.logger = new Logger(LogLevel.Off)
  })

  afterEach(async () => {
    await deleteFolder(logPath)
    jest.resetAllMocks()
  })

  afterAll(async () => {
    await removeTestServerFolder(`/Public/app/cli-tests/${target.name}`, target)

    await deleteFile(csvPath)
    await removeTestApp(__dirname, target.name)
    await removeFromGlobalConfig(target.name)
  })

  it('should execute flow with 2 successful jobs', async () => {
    const sourcePath = path.join(__dirname, 'sourceFiles', 'testFlow_1.json')

    await execute(target, sasjs, authConfig, sourcePath, logPath, csvPath)

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

    expect(csvData.match(csvColumnsRegExp)!.length).toEqual(1)
    expect(csvData.match(csvRowRegExp)!.length).toEqual(2)
  })

  it(
    'should execute flow with job log having large log',
    async () => {
      const largeLogFileLines = 21 * 1000

      const sourcePath = path.join(__dirname, 'sourceFiles', 'testFlow_8.json')

      await execute(target, sasjs, authConfig, sourcePath, logPath)

      await expect(folderExists(logPath)).resolves.toEqual(true)
      const filesInLogFolder = await listFilesInFolder(logPath)
      const logFilePath = path.join(logPath, filesInLogFolder[0])

      const logContent = await readFile(logFilePath)
      let count = 0
      for (let i = 0; i < logContent.length; i++) {
        if (logContent[i] === '\n') count++
      }

      expect(count).toBeGreaterThan(largeLogFileLines)
      expect(/GLOBAL TEST_VAR_1 test_var_value_1/.test(logContent)).toEqual(
        true
      )
      expect(/GLOBAL TEST_VAR_2 test_var_value_2/.test(logContent)).toEqual(
        true
      )
    },
    30 * 60 * 1000
  )

  it('should return an error if provided source file is not JSON', async () => {
    const sourcePath = path.join(__dirname, 'sourceFiles', 'not_valid.txt')

    await expect(
      execute(target, sasjs, authConfig, sourcePath, logPath, csvPath)
    ).rejects.toEqual(
      `Please provide flow source (--source) file.\n${examples.command}`
    )
  })

  it('should return an error if provided source file does not exist', async () => {
    const sourcePath = path.join(
      __dirname,
      'sourceFiles',
      'does_not_exist.json'
    )

    await expect(
      execute(target, sasjs, authConfig, sourcePath, logPath, csvPath)
    ).rejects.toEqual(`Source file does not exist.\n${examples.command}`)
  })

  it('should return an error if provided an invalid source file', async () => {
    const sourcePath = path.join(__dirname, 'sourceFiles', 'not_valid_1.json')

    await expect(
      execute(target, sasjs, authConfig, sourcePath, logPath, csvPath)
    ).rejects.toEqual(
      `Unable to parse JSON of provided source file.\n` + examples.source
    )
  })

  it('should return an error if provided source file does not have flows property', async () => {
    const sourcePath = path.join(__dirname, 'sourceFiles', 'not_valid_2.json')

    await expect(
      execute(target, sasjs, authConfig, sourcePath, logPath, csvPath)
    ).rejects.toEqual(
      `There are no flows present in source JSON.\n` + examples.source
    )
  })

  it('should return an error if provided source file does not have jobs property', async () => {
    const sourcePath = path.join(__dirname, 'sourceFiles', 'not_valid_3.json')

    await expect(
      execute(target, sasjs, authConfig, sourcePath, logPath, csvPath)
    ).rejects.toEqual(examples.source)
  })

  it('should execute flow with 2 successful jobs and 1 failing job', async () => {
    const sourcePath = path.join(__dirname, 'sourceFiles', 'testFlow_2.json')

    await execute(target, sasjs, authConfig, sourcePath, logPath, csvPath)

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

    expect(csvData.match(csvColumnsRegExp)!.length).toEqual(1)
    expect(csvData.match(csvRowCompletedRegExp)!.length).toEqual(2)
    expect(csvData.match(csvRowFailedRegExp)!.length).toEqual(1)
  })

  it('should execute flow with 1 successful job and 1 job that does not exist', async () => {
    const sourcePath = path.join(__dirname, 'sourceFiles', 'testFlow_3.json')

    jest.spyOn(process.logger, 'error')

    await execute(target, sasjs, authConfig, sourcePath, logPath, csvPath)

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

    expect(csvData.match(csvColumnsRegExp)!.length).toEqual(1)
    expect(csvData.match(csvRowCompletedRegExp)!.length).toEqual(1)
    expect(csvData.match(csvRowFailedRegExp)!.length).toEqual(1)

    expect(process.logger.error).toHaveBeenNthCalledWith(
      1,
      "An error has occurred when executing 'firstFlow' flow's job located at: 'jobs/testJob/DOES_NOT_EXIST'. Job was not found."
    )
  })

  it(`should execute 2 chained flows with a failing job in predecessor's flow`, async () => {
    const sourcePath = path.join(__dirname, 'sourceFiles', 'testFlow_4.json')

    await execute(target, sasjs, authConfig, sourcePath, logPath, csvPath)

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

    expect(csvData.match(csvColumnsRegExp)!.length).toEqual(1)
    expect(csvData.match(csvRowCompletedRegExp)!.length).toEqual(1)
    expect(csvData.match(csvRowFailedRegExp)!.length).toEqual(1)
  })

  it(`should execute 2 chained flows with a failing job in successor's flow`, async () => {
    const sourcePath = path.join(__dirname, 'sourceFiles', 'testFlow_5.json')

    await execute(target, sasjs, authConfig, sourcePath, logPath, csvPath)

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

    expect(csvData.match(csvColumnsRegExp)!.length).toEqual(1)
    expect(csvData.match(csvRowFirstFlowCompletedRegExp)!.length).toEqual(2)
    expect(csvData.match(csvRowSecondFlowCompletedRegExp)!.length).toEqual(1)
    expect(csvData.match(csvRowFailedRegExp)!.length).toEqual(1)
  })

  it(`should execute 3 chained flows with a failing job in one of the predecessor's flow`, async () => {
    const sourcePath = path.join(__dirname, 'sourceFiles', 'testFlow_6.json')

    await execute(target, sasjs, authConfig, sourcePath, logPath, csvPath)

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

    expect(csvData.match(csvColumnsRegExp)!.length).toEqual(1)
    expect(csvData.match(csvRowFirstFlowCompletedRegExp)!.length).toEqual(2)
    expect(csvData.match(csvRowFailedRegExp)!.length).toEqual(1)
  })

  it(`should execute 6 chained flows with failing and succeeding jobs`, async () => {
    const sourcePath = path.join(__dirname, 'sourceFiles', 'testFlow_7.json')

    await execute(target, sasjs, authConfig, sourcePath, logPath, csvPath)

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

    expect(csvData.match(csvColumnsRegExp)!.length).toEqual(1)
    expect(csvData.match(csvRowFirstFlowCompletedRegExp)!.length).toEqual(2)
    expect(csvData.match(csvRowSecondFlowCompletedRegExp)!.length).toEqual(1)
    expect(csvData.match(csvRowThirdFlowCompletedRegExp)!.length).toEqual(1)
    expect(csvData.match(csvRowThirdFlowFailedRegExp)!.length).toEqual(1)
    expect(csvData.match(csvRowFourthFlowCompletedRegExp)!.length).toEqual(1)
    expect(csvData.match(csvRowFailedRegExp)).toEqual(null)
  })

  it('should execute flow and create csv file in default location', async () => {
    const sourcePath = path.join(__dirname, 'sourceFiles', 'testFlow_1.json')
    const csvLoc = path.join(
      __dirname,
      target.name,
      'sasjsbuild',
      'flowResults.csv'
    )

    await execute(target, sasjs, authConfig, sourcePath, logPath, csvLoc)

    await expect(fileExists(csvLoc)).resolves.toEqual(true)

    const csvData = (await readFile(csvLoc)) as string

    const csvColumnsRegExp = new RegExp(
      '^id,Flow,Predecessors,Location,Status,Log location,Details'
    )
    const csvRowRegExp = new RegExp(
      `\\d,firstFlow,none,\/Public\/app\/cli-tests\/${target.name}\/jobs\/testJob\/job,completed,`,
      'gm'
    )

    expect(csvData.match(csvColumnsRegExp)!.length).toEqual(1)
    expect(csvData.match(csvRowRegExp)!.length).toEqual(2)
  })
})

function generateTarget(serverType = ServerType.SasViya): Target {
  dotenv.config()
  const timestamp = generateTimestamp()
  const targetName = `cli-tests-flow-${timestamp}`
  return new Target({
    name: targetName,
    serverType,
    serverUrl: (serverType === ServerType.SasViya
      ? process.env.VIYA_SERVER_URL
      : process.env.SAS9_SERVER_URL) as string,
    appLoc: `/Public/app/cli-tests/${targetName}`,
    contextName,
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
