import { Target } from '@sasjs/utils'
import {
  buildServices,
  compileServices,
  compileBuildServices
} from '../../../main'
import { Command } from '../../../utils/command'
import { removeFromGlobalConfig } from '../../../utils/config'
import {
  createTestApp,
  createTestGlobalTarget,
  removeTestApp,
  verifyStep
} from '../../../utils/test'
import { generateTimestamp } from '../../../utils/utils'

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
    await expect(compileServices(new Command(`compile`))).toResolve()

    await verifyStep({ parentFolderName: '.', step: 'compile' })
    done()
  })

  it(`should compile and build`, async (done) => {
    await expect(buildServices(new Command(`build`))).toResolve()

    await verifyStep({ parentFolderName: '.', step: 'compile' })
    await verifyStep({ parentFolderName: '.', step: 'build' })
    done()
  })

  it(`should compile and build(skipping compile)`, async (done) => {
    await expect(compileServices(new Command('compile'))).toResolve()

    await verifyStep({ parentFolderName: '.', step: 'compile' })

    await expect(buildServices(new Command('build'))).toResolve()

    await verifyStep({ parentFolderName: '.', step: 'build' })
    done()
  })

  it(`should compile and build(with recompile)`, async (done) => {
    await expect(compileServices(new Command('compile'))).toResolve()

    await verifyStep({ parentFolderName: '.', step: 'compile' })

    await expect(compileBuildServices(new Command('compilebuild'))).toResolve()

    await verifyStep({ parentFolderName: '.', step: 'build' })
    done()
  })
})
