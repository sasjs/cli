import { Folder } from '../../../types'
import { findTargetInConfiguration } from '../../../utils/config'
import { createTestApp, removeTestApp, verifyFolder } from '../../../utils/test'
import { asyncForEach, generateTimestamp } from '../../../utils/utils'
import * as compileModule from '../compile'

describe('sasjs compile', () => {
  let appName: string

  beforeEach(async (done) => {
    appName = `cli-tests-compile-${generateTimestamp()}`
    await createTestApp(__dirname, appName)
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
    await expect(compileModule.compile('viya')).toResolve()
    expect(compileModule.copyFilesToBuildFolder).toHaveBeenCalled()
    expect(compileModule.compileJobsAndServices).toHaveBeenCalled()
    done()
  })

  it('should skip compilation if a project is already compiled', async (done) => {
    await expect(compileModule.compile('viya')).toResolve()
    expect(compileModule.copyFilesToBuildFolder).toHaveBeenCalled()
    expect(compileModule.compileJobsAndServices).toHaveBeenCalled()

    jest.resetAllMocks()
    await compileModule.compile('viya')
    expect(compileModule.copyFilesToBuildFolder).not.toHaveBeenCalled()
    expect(compileModule.compileJobsAndServices).not.toHaveBeenCalled()
    done()
  })
})
