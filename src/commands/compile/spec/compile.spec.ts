import { Target } from '@sasjs/utils'
import { findTargetInConfiguration } from '../../../utils/config'
import {
  createTestApp,
  removeTestApp,
  removeAllTargetsFromConfigs
} from '../../../utils/test'
import { generateTimestamp } from '../../../utils/utils'
import * as compileModule from '../compile'

describe('sasjs compile', () => {
  let appName: string
  let target: Target

  beforeEach(async (done) => {
    appName = `cli-tests-compile-${generateTimestamp()}`
    await createTestApp(__dirname, appName)
    target = (await findTargetInConfiguration('viya')).target
    jest.spyOn(compileModule, 'copyFilesToBuildFolder')
    jest.spyOn(compileModule, 'compileJobsAndServices')
    done()
  })

  afterEach(async (done) => {
    await removeTestApp(__dirname, appName)
    jest.clearAllMocks()

    done()
  })

  it('should compile an uncompiled project', async (done) => {
    await expect(compileModule.compile(target)).toResolve()
    expect(compileModule.copyFilesToBuildFolder).toHaveBeenCalled()
    expect(compileModule.compileJobsAndServices).toHaveBeenCalled()

    done()
  })

  it('should compile an uncompiled project having no target', async (done) => {
    await removeAllTargetsFromConfigs()

    await expect(compileModule.compile({} as Target)).toResolve()
    expect(compileModule.copyFilesToBuildFolder).toHaveBeenCalled()
    expect(compileModule.compileJobsAndServices).toHaveBeenCalled()

    done()
  })

  it('should skip compilation if a project is already compiled', async (done) => {
    await expect(compileModule.compile(target)).toResolve()
    expect(compileModule.copyFilesToBuildFolder).toHaveBeenCalled()
    expect(compileModule.compileJobsAndServices).toHaveBeenCalled()

    jest.resetAllMocks()

    await compileModule.compile(target)
    expect(compileModule.copyFilesToBuildFolder).not.toHaveBeenCalled()
    expect(compileModule.compileJobsAndServices).not.toHaveBeenCalled()

    done()
  })
})
