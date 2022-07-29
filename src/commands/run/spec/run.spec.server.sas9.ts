import dotenv from 'dotenv'
import path from 'path'
import { runSasCode } from '../..'
import { copy, Target, generateTimestamp, ServerType } from '@sasjs/utils'
import {
  createTestApp,
  generateTestTarget,
  removeTestApp,
  removeTestServerFolder
} from '../../../utils/test'

describe('sasjs run with SAS9', () => {
  let target: Target

  beforeEach(async () => {
    const appName = 'cli-tests-run-sas9-' + generateTimestamp()
    await createTestApp(__dirname, appName)
    target = generateTestTarget(
      appName,
      `/Public/app/cli-tests/${appName}`,
      {
        serviceFolders: ['sasjs/testServices'],
        initProgram: '',
        termProgram: '',
        macroVars: {}
      },
      ServerType.Sas9
    )
    await copy(
      path.join(__dirname, 'testServices'),
      path.join(process.projectDir, 'sasjs', 'testServices')
    )
  })

  afterEach(async () => {
    await removeTestServerFolder(target.appLoc, target)
    await removeTestApp(__dirname, target.name)
  })

  it('should run a file when a relative path is provided', async () => {
    const logParts = ['data;', 'do x=1 to 100;', 'output;', 'end;', 'run;']

    const result: any = await runSasCode(
      target,
      'sasjs/testServices/logJob.sas'
    )

    logParts.forEach((logPart) => {
      expect(result.log.includes(logPart)).toBeTruthy()
    })
  })

  it('should run a file when an absolute path is provided', async () => {
    const logParts = ['data;', 'do x=1 to 100;', 'output;', 'end;', 'run;']

    const result: any = await runSasCode(
      target,
      `${process.projectDir}/sasjs/testServices/logJob.sas`
    )

    logParts.forEach((logPart) => {
      expect(result.log.includes(logPart)).toBeTruthy()
    })
  })
})
