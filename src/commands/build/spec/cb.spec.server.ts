import path from 'path'
import { Target, generateTimestamp } from '@sasjs/utils'
import { compileBuildServices } from '../../../main'
import { Command } from '../../../utils/command'
import { removeFromGlobalConfig } from '../../../utils/config'
import {
  createTestApp,
  createTestGlobalTarget,
  removeTestApp,
  verifyStep
} from '../../../utils/test'
import { copy, deleteFile } from '../../../utils/file'
import { compile } from '../../compile/compile'
import { build } from '../build'

describe('sasjs compile', () => {
  let target: Target

  beforeEach(async (done) => {
    const appName = 'cli-tests-cb-' + generateTimestamp()
    await createTestApp(__dirname, appName)
    target = await createTestGlobalTarget(
      appName,
      `/Public/app/cli-tests/${appName}`
    )

    done()
  })

  afterEach(async (done) => {
    await removeFromGlobalConfig(target.name)
    await removeTestApp(__dirname, target.name)
    done()
  })

  it(`should compile newly created app`, async (done) => {
    await expect(compile(target)).toResolve()

    await verifyStep('compile')
    done()
  })

  it(`should compile and build`, async (done) => {
    await expect(build(target)).toResolve()

    await verifyStep('compile')
    await verifyStep('build', target.name)
    done()
  })

  it(`should compile and build (special fileName case)`, async (done) => {
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
    done()
  })

  it(`should compile and build(skipping compile)`, async (done) => {
    await expect(compile(target)).toResolve()

    await verifyStep('compile')

    await expect(build(target)).toResolve()

    await verifyStep('build', target.name)
    done()
  })

  it(`should compile and build(with recompile)`, async (done) => {
    await expect(compile(target)).toResolve()

    await verifyStep('compile')

    await expect(
      compileBuildServices(new Command(`compilebuild -t ${target.name}`))
    ).toResolve()

    await verifyStep('build', target.name)
    done()
  })
})
