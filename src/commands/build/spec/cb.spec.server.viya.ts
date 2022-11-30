import path from 'path'
import {
  createTestApp,
  generateTestTarget,
  removeTestApp,
  verifyStep
} from '../../../utils/test'
import {
  Target,
  generateTimestamp,
  deleteFile,
  copy,
  ServerType
} from '@sasjs/utils'
import { compile } from '../../compile/compile'
import { build } from '../build'

describe('sasjs compile with Viya', () => {
  let target: Target

  beforeEach(async () => {
    const appName = 'cli-tests-cb-' + generateTimestamp()

    await createTestApp(__dirname, appName)

    target = generateTestTarget(
      appName,
      `/Public/app/cli-tests/${appName}`,
      {
        serviceFolders: [path.join('sasjs', 'services')],
        initProgram: '',
        termProgram: '',
        macroVars: {}
      },
      ServerType.SasViya
    )
  })

  afterEach(async () => {
    await removeTestApp(__dirname, target.name)
  })

  it(`should compile newly created app`, async () => {
    await expect(compile(target)).toResolve()

    await verifyStep('compile')
  })

  it(`should compile and build`, async () => {
    await expect(build(target)).toResolve()

    await verifyStep('compile')
    await verifyStep('build', target.name)
  })

  it(`should compile and build (special fileName case)`, async () => {
    const filePath = 'sasjs/services/common/'
    const sourcePath = path.join(process.projectDir, filePath, 'getdata.sas')
    const destinationPath = path.join(
      process.projectDir,
      filePath,
      'get.sasdata.sas'
    )

    await copy(sourcePath, destinationPath)
    await deleteFile(sourcePath)

    await expect(build(target)).toResolve()

    await verifyStep('compile', undefined, 'custom')
    await verifyStep('build', target.name, 'custom')
  })

  it(`should compile and build(skipping compile)`, async () => {
    await expect(compile(target)).toResolve()

    await verifyStep('compile')

    await expect(build(target)).toResolve()

    await verifyStep('build', target.name)
  })
})
