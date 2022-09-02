import path from 'path'
import { runSasCode } from '../..'
import { copy, Target, generateTimestamp, ServerType } from '@sasjs/utils'
import {
  createTestApp,
  generateTestTarget,
  removeTestApp,
  removeTestServerFolder
} from '../../../utils/test'

describe('sasjs run with server type sasjs', () => {
  let target: Target

  beforeEach(async () => {
    const appName = 'cli-tests-run-sasjs' + generateTimestamp()
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
      ServerType.Sasjs
    )
    await copy(
      path.join(__dirname, 'testServices'),
      path.join(process.projectDir, 'sasjs', 'testServices')
    )
  })

  afterEach(async () => {
    await removeTestApp(__dirname, target.name)
  })

  it('should run a file when a relative path is provided', async () => {
    await expect(runSasCode(target, 'sasjs/testServices/logJob.js')).toResolve()
  })

  it('should run a file when an absolute path is provided', async () => {
    await expect(
      runSasCode(target, `${process.projectDir}/sasjs/testServices/logJob.js`)
    ).toResolve()
  })
})
