import { Target } from '@sasjs/utils'
import { compileBuildServices } from '../../../main'
import { Command } from '../../../utils/command'
import { removeFromGlobalConfig } from '../../../utils/config'
import {
  createTestApp,
  createTestGlobalTarget,
  removeTestApp,
  verifyStep
} from '../../../utils/test'
import { generateTimestamp } from '../../../utils/utils'
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
    await expect(compile(target.name)).toResolve()

    await verifyStep({
      parentFolderName: '.',
      step: 'compile',
      targetName: target.name
    })
    done()
  })

  it(`should compile and build`, async (done) => {
    await expect(build(target.name)).toResolve()

    await verifyStep({
      parentFolderName: '.',
      step: 'compile',
      targetName: target.name
    })
    await verifyStep({
      parentFolderName: '.',
      step: 'build',
      targetName: target.name
    })
    done()
  })

  it(`should compile and build(skipping compile)`, async (done) => {
    await expect(compile(target.name)).toResolve()

    await verifyStep({
      parentFolderName: '.',
      step: 'compile',
      targetName: target.name
    })

    await expect(build(target.name)).toResolve()

    await verifyStep({
      parentFolderName: '.',
      step: 'build',
      targetName: target.name
    })
    done()
  })

  it(`should compile and build(with recompile)`, async (done) => {
    await expect(compile(target.name)).toResolve()

    await verifyStep({
      parentFolderName: '.',
      step: 'compile',
      targetName: target.name
    })

    await expect(
      compileBuildServices(new Command(`compilebuild -t ${target.name}`))
    ).toResolve()

    await verifyStep({
      parentFolderName: '.',
      step: 'build',
      targetName: target.name
    })
    done()
  })
})
