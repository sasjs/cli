import { Target } from '@sasjs/utils/types'
import path from 'path'
import { removeFromGlobalConfig } from '../../../utils/config'
import { readFile } from '../../../utils/file'
import {
  createTestGlobalTarget,
  createTestMinimalApp,
  removeTestApp
} from '../../../utils/test'
import { generateTimestamp } from '../../../utils/utils'
import {
  getDependencyPaths,
  prioritiseDependencyOverrides
} from '../../shared/dependencies'

describe('getDependencyPaths', () => {
  let target: Target

  beforeAll(async () => {
    const appName = `cli-tests-dependency-paths-${generateTimestamp()}`
    target = await createTestGlobalTarget(appName, '/Public/app')
    await createTestMinimalApp(__dirname, target.name)
  })

  afterAll(async (done) => {
    await removeFromGlobalConfig(target.name)
    await removeTestApp(__dirname, target.name)
    done()
  })

  test('it should recursively get all dependency paths', async (done) => {
    const fileContent = await readFile(path.join(__dirname, './example.sas'))
    const dependenciesList = [
      'mv_createfolder.sas',
      'mp_abort.sas',
      'mf_getuniquefileref.sas',
      'mf_getuniquelibref.sas',
      'mf_isblank.sas',
      'mf_mval.sas',
      'mf_getplatform.sas',
      'mf_trimstr.sas'
    ]
    const dependencyPaths = await getDependencyPaths(fileContent)

    dependencyPaths.forEach((dep) => {
      expect(dependenciesList.some((x) => dep.includes(x))).toBeTruthy()
    })

    done()
  })

  test('it should get third level dependencies', async (done) => {
    const fileContent = await readFile(
      path.join(__dirname, './nested-deps.sas')
    )
    const dependenciesList = [
      'mf_isblank.sas',
      'mm_createwebservice.sas',
      'mm_createstp.sas',
      'mf_getuser.sas',
      'mm_createfolder.sas',
      'mm_deletestp.sas',
      'mf_nobs.sas',
      'mf_getattrn.sas',
      'mf_abort.sas',
      'mf_verifymacvars.sas',
      'mm_getdirectories.sas',
      'mm_updatestpsourcecode.sas',
      'mp_dropmembers.sas',
      'mm_getservercontexts.sas',
      'mm_getrepos.sas'
    ]

    const dependencyPaths = await getDependencyPaths(fileContent)

    dependenciesList.forEach((expectedDep) => {
      expect(
        dependencyPaths.some((dep) => dep.includes(expectedDep))
      ).toBeTruthy()
    })

    done()
  })

  test('it should throw an error when a dependency is not found', async (done) => {
    const missingDependencies = ['foobar.sas', 'foobar2.sas']
    const missingDependencyFile = './missing-dependency.sas'

    const fileContent = await readFile(
      path.join(__dirname, missingDependencyFile)
    )

    await expect(getDependencyPaths(fileContent)).rejects.toEqual(
      `Unable to locate dependencies: ${missingDependencies.join(', ')}`
    )

    done()
  })

  test('it should ignore non-sas dependencies', async (done) => {
    const fileContent = await readFile(
      path.join(__dirname, './non-sas-dependency.sas')
    )
    const dependenciesList = [
      'mv_createfolder.sas',
      'mp_abort.sas',
      'mf_getuniquefileref.sas',
      'mf_getuniquelibref.sas',
      'mf_isblank.sas',
      'mf_mval.sas',
      'mf_getplatform.sas',
      'mf_trimstr.sas'
    ]

    await expect(getDependencyPaths(fileContent)).resolves.not.toThrow()

    const dependencyPaths = await getDependencyPaths(fileContent)

    dependencyPaths.forEach((dep) => {
      expect(dependenciesList.some((x) => dep.includes(x))).toBeTruthy()
    })

    done()
  })

  test('it should prioritise overridden dependencies', () => {
    const dependencyNames = ['mf_abort.sas']
    const dependencyPaths = [
      'node_modules/@sasjs/core/core/mf_abort.sas',
      'sas/macros/mf_abort.sas'
    ]

    const result = prioritiseDependencyOverrides(
      dependencyNames,
      dependencyPaths
    )

    expect(result).toEqual(['sas/macros/mf_abort.sas'])
  })

  test('it should prioritise overridden dependencies with windows file paths', () => {
    const dependencyNames = ['mf_abort.sas']
    const dependencyPaths = [
      'node_modules\\@sasjs\\core\\core\\mf_abort.sas',
      'sas\\macros\\mf_abort.sas'
    ]

    const result = prioritiseDependencyOverrides(
      dependencyNames,
      dependencyPaths,
      [],
      '\\'
    )

    expect(result).toEqual(['sas\\macros\\mf_abort.sas'])
  })

  test('it should prioritise overridden dependencies provided specific macros', () => {
    const dependencyNames = ['mf_abort.sas']
    const dependencyPaths = [
      'node_modules/@sasjs/core/core/mf_abort.sas',
      'sas/sas9macros/mf_abort.sas',
      'sas/macros/mf_abort.sas'
    ]

    const result = prioritiseDependencyOverrides(
      dependencyNames,
      dependencyPaths,
      ['sas9macros']
    )

    expect(result).toEqual(['sas/sas9macros/mf_abort.sas'])
  })

  test(`it should prioritise overridden dependencies, if specific 'macroLoc' was provided, but macro at such 'macroLoc' is not present`, () => {
    const dependencyNames = ['mf_abort.sas']
    const dependencyPaths = [
      'node_modules/@sasjs/core/core/mf_abort.sas',
      'sas/macros/mf_abort.sas'
    ]

    const result = prioritiseDependencyOverrides(
      dependencyNames,
      dependencyPaths,
      ['sas9macros']
    )

    expect(result).toEqual(['sas/macros/mf_abort.sas'])
  })

  test('it should prioritise overridden dependencies and remove extra dependencies, if specific macros were provided', () => {
    const dependencyNames = ['mf_abort.sas']
    const dependencyPaths = [
      'node_modules/@sasjs/core/core/mf_abort.sas',
      'sas/sasviyamacros/mf_abort.sas',
      'sas/sas9macros/mf_abort.sas',
      'sas/macros2/mf_abort.sas',
      'sas/macros/mf_abort.sas'
    ]

    const result = prioritiseDependencyOverrides(
      dependencyNames,
      dependencyPaths,
      ['sas9macros']
    )

    expect(result).toEqual(['sas/sas9macros/mf_abort.sas'])
  })

  test('it should prioritise overridden dependencies and remove duplicated dependencies, if specific macros were provided', () => {
    const dependencyNames = ['mf_abort.sas']
    const dependencyPaths = [
      'node_modules/@sasjs/core/core/mf_abort.sas',
      'sas/sas9macros/mf_abort.sas',
      'sas/sas9macros/mf_abort.sas',
      'sas/macros/mf_abort.sas',
      'sas/macros/mf_abort.sas'
    ]

    const result = prioritiseDependencyOverrides(
      dependencyNames,
      dependencyPaths,
      ['sas9macros']
    )

    expect(result).toEqual(['sas/sas9macros/mf_abort.sas'])
  })
})
