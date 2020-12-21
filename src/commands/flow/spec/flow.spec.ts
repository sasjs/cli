import path from 'path'
import { compileBuildDeployServices } from '../../../main'
import { generateTimestamp } from '../../../utils/utils'
import {
  fileExists,
  readFile,
  folderExists,
  deleteFolder,
  deleteFile
} from '../../../utils/file'
import { processFlow } from '..'
import { folder } from '../../../commands/folder'
import {
  createTestApp,
  createTestGlobalTarget,
  removeTestApp
} from '../../../utils/test'
import { removeFromGlobalConfig } from '../../../utils/config-utils'
import examples from '../examples'

describe('sasjs flow', () => {
  const cwd = process.cwd()
  const csvPath = path.join(cwd, 'src/commands/flow/spec/output.csv')
  const logPath = path.join(cwd, 'src/commands/flow/spec/logs')
  const targetName = 'cli-tests-flow-' + generateTimestamp()
  const appName = targetName

  beforeAll(async () => {
    await createTestApp(__dirname, appName)
    await createTestGlobalTarget(
      targetName,
      `/Public/app/cli-tests/${targetName}`
    )
    await compileBuildDeployServices(`cbd ${targetName} -f`)
  }, 60 * 1000)

  it(
    'should execute flow with 2 successful jobs',
    async () => {
      const sourcePath = path.join(
        cwd,
        'src/commands/flow/spec/sourceFiles/testFlow_1.json'
      )

      const command = `flow execute -s ${sourcePath} -t ${targetName} --csvFile ${csvPath} --logFolder ${logPath}`

      await processFlow(command)

      await expect(fileExists(csvPath)).resolves.toEqual(true)
      await expect(folderExists(logPath)).resolves.toEqual(true)

      const csvData = (await readFile(csvPath)) as string

      const csvColumnsRegExp = new RegExp(
        '^id,Flow,Predecessors,Location,Status,Log location,Details'
      )
      const csvRowRegExp = new RegExp(
        `\\d,firstFlow,none,\/Public\/app\/cli-tests\/${targetName}\/jobs\/jobs\/job,completed,`,
        'gm'
      )

      expect((csvData.match(csvColumnsRegExp) || []).length).toEqual(1)
      expect((csvData.match(csvRowRegExp) || []).length).toEqual(2)
    },
    60 * 1000
  )

  it('should return an error if provided source file is not JSON', async () => {
    const sourcePath = path.join(
      cwd,
      'src/commands/flow/spec/sourceFiles/not_valid.txt'
    )

    const command = `flow execute -s ${sourcePath} -t ${targetName} --csvFile ${csvPath} --logFolder ${logPath}`

    await expect(processFlow(command)).resolves.toEqual(
      `Please provide flow source (--source) file.\n${examples.command}`
    )
  })

  it('should return an error if provided source file does not exist', async () => {
    const sourcePath = path.join(
      cwd,
      'src/commands/flow/spec/sourceFiles/does_not_exist.json'
    )

    const command = `flow execute -s ${sourcePath} -t ${targetName} --csvFile ${csvPath} --logFolder ${logPath}`

    await expect(processFlow(command)).resolves.toEqual(
      `Source file does not exist.\n${examples.command}`
    )
  })

  it('should return an error if provided not valid source file', async () => {
    const sourcePath = path.join(
      cwd,
      'src/commands/flow/spec/sourceFiles/not_valid_1.json'
    )

    const command = `flow execute -s ${sourcePath} -t ${targetName} --csvFile ${csvPath} --logFolder ${logPath}`

    await expect(processFlow(command)).resolves.toEqual(examples.source)
  })

  it('should return an error if provided source file does not have flows property', async () => {
    const sourcePath = path.join(
      cwd,
      'src/commands/flow/spec/sourceFiles/not_valid_2.json'
    )

    const command = `flow execute -s ${sourcePath} -t ${targetName} --csvFile ${csvPath} --logFolder ${logPath}`

    await expect(processFlow(command)).resolves.toEqual(examples.source)
  })

  it('should return an error if provided source file does not have jobs property', async () => {
    const sourcePath = path.join(
      cwd,
      'src/commands/flow/spec/sourceFiles/not_valid_3.json'
    )

    const command = `flow execute -s ${sourcePath} -t ${targetName} --csvFile ${csvPath} --logFolder ${logPath}`

    await expect(processFlow(command)).resolves.toEqual(examples.source)
  })

  it(
    'should execute flow with 2 successful jobs and 1 failing job',
    async () => {
      const sourcePath = path.join(
        cwd,
        'src/commands/flow/spec/sourceFiles/testFlow_2.json'
      )

      const command = `flow execute -s ${sourcePath} -t ${targetName} --csvFile ${csvPath} --logFolder ${logPath}`

      await processFlow(command)

      const csvData = await readFile(csvPath)

      const csvColumnsRegExp = new RegExp(
        '^id,Flow,Predecessors,Location,Status,Log location,Details'
      )
      const csvRowCompletedRegExp = new RegExp(
        `\\d,firstFlow,none,\/Public\/app\/cli-tests\/${targetName}\/jobs\/jobs\/job,completed,`,
        'gm'
      )
      const csvRowFailedRegExp = new RegExp(
        `\\d,firstFlow,none,\/Public\/app\/cli-tests\/${targetName}\/jobs\/jobs\/failingJob,failure,`,
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
        'src/commands/flow/spec/sourceFiles/testFlow_3.json'
      )

      const command = `flow execute -s ${sourcePath} -t ${targetName} --csvFile ${csvPath} --logFolder ${logPath}`

      await processFlow(command)

      const csvData = await readFile(csvPath)

      const csvColumnsRegExp = new RegExp(
        '^id,Flow,Predecessors,Location,Status,Log location,Details'
      )
      const csvRowCompletedRegExp = new RegExp(
        `\\d,firstFlow,none,\/Public\/app\/cli-tests\/${targetName}\/jobs\/jobs\/job,completed,`,
        'gm'
      )
      const csvRowFailedRegExp = new RegExp(
        `\\d,firstFlow,none,\/Public\/app\/cli-tests\/${targetName}\/jobs\/jobs\/DOES_NOT_EXIST,failure,,Job was not found.`,
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
        'src/commands/flow/spec/sourceFiles/testFlow_4.json'
      )

      const command = `flow execute -s ${sourcePath} -t ${targetName} --csvFile ${csvPath} --logFolder ${logPath}`

      await processFlow(command)

      const csvData = await readFile(csvPath)

      const csvColumnsRegExp = new RegExp(
        '^id,Flow,Predecessors,Location,Status,Log location,Details'
      )
      const csvRowCompletedRegExp = new RegExp(
        `\\d,firstFlow,none,\/Public\/app\/cli-tests\/${targetName}\/jobs\/jobs\/job,completed,`,
        'gm'
      )
      const csvRowFailedRegExp = new RegExp(
        `\\d,firstFlow,none,\/Public\/app\/cli-tests\/${targetName}\/jobs\/jobs\/failingJob,failure,`,
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
        'src/commands/flow/spec/sourceFiles/testFlow_5.json'
      )

      const command = `flow execute -s ${sourcePath} -t ${targetName} --csvFile ${csvPath} --logFolder ${logPath}`

      await processFlow(command)

      const csvData = await readFile(csvPath)

      const csvColumnsRegExp = new RegExp(
        '^id,Flow,Predecessors,Location,Status,Log location,Details'
      )
      const csvRowFirstFlowCompletedRegExp = new RegExp(
        `\\d,firstFlow,none,\/Public\/app\/cli-tests\/${targetName}\/jobs\/jobs\/job,completed,`,
        'gm'
      )
      const csvRowSecondFlowCompletedRegExp = new RegExp(
        `\\d,secondFlow,firstFlow,\/Public\/app\/cli-tests\/${targetName}\/jobs\/jobs\/job,completed,`,
        'gm'
      )
      const csvRowFailedRegExp = new RegExp(
        `\\d,secondFlow,firstFlow,\/Public\/app\/cli-tests\/${targetName}\/jobs\/jobs\/failingJob,failure,`,
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
        'src/commands/flow/spec/sourceFiles/testFlow_6.json'
      )

      const command = `flow execute -s ${sourcePath} -t ${targetName} --csvFile ${csvPath} --logFolder ${logPath}`

      await processFlow(command)

      const csvData = await readFile(csvPath)

      const csvColumnsRegExp = new RegExp(
        '^id,Flow,Predecessors,Location,Status,Log location,Details'
      )
      const csvRowFirstFlowCompletedRegExp = new RegExp(
        `\\d,firstFlow,none,\/Public\/app\/cli-tests\/${targetName}\/jobs\/jobs\/job,completed,`,
        'gm'
      )
      const csvRowFailedRegExp = new RegExp(
        `\\d,secondFlow,firstFlow,\/Public\/app\/cli-tests\/${targetName}\/jobs\/jobs\/failingJob,failure,`,
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
        'src/commands/flow/spec/sourceFiles/testFlow_7.json'
      )

      const command = `flow execute -s ${sourcePath} -t ${targetName} --csvFile ${csvPath} --logFolder ${logPath}`

      await processFlow(command)

      const csvData = await readFile(csvPath)

      const csvColumnsRegExp = new RegExp(
        '^id,Flow,Predecessors,Location,Status,Log location,Details'
      )
      const csvRowFirstFlowCompletedRegExp = new RegExp(
        `\\d,firstFlow,none,\/Public\/app\/cli-tests\/${targetName}\/jobs\/jobs\/job,completed,`,
        'gm'
      )
      const csvRowSecondFlowCompletedRegExp = new RegExp(
        `\\d,secondFlow,firstFlow,\/Public\/app\/cli-tests\/${targetName}\/jobs\/jobs\/job,completed,`,
        'gm'
      )
      const csvRowThirdFlowCompletedRegExp = new RegExp(
        `\\d,thirdFlow,firstFlow \\| secondFlow,\/Public\/app\/cli-tests\/${targetName}\/jobs\/jobs\/job,completed,`,
        'gm'
      )
      const csvRowThirdFlowFailedRegExp = new RegExp(
        `\\d,thirdFlow,firstFlow \\| secondFlow,\/Public\/app\/cli-tests\/${targetName}\/jobs\/jobs\/failingJob,failure,`,
        'gm'
      )
      const csvRowFourthFlowCompletedRegExp = new RegExp(
        `\\d,fourthFlow,secondFlow,\/Public\/app\/cli-tests\/${targetName}\/jobs\/jobs\/job,completed,`,
        'gm'
      )
      const csvRowSixthFlowCompletedRegExp = new RegExp(
        `\\d,sixFlow,none,\/Public\/app\/cli-tests\/${targetName}\/jobs\/jobs\/job,completed,`,
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

  afterAll(async (done) => {
    await folder(
      `folder delete /Public/app/cli-tests/${targetName} -t ${targetName}`
    )
    await deleteFile(csvPath)
    await deleteFolder(logPath)
    await removeTestApp(__dirname, appName)
    await removeFromGlobalConfig(targetName)
    done()
  })
})
