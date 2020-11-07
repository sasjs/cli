import path from 'path'
import { readFile } from '../../../src/utils/file-utils'
import {
  getDependencyPaths,
  prioritiseDependencyOverrides
} from '../../../src/sasjs-build/index'

process.projectDir = path.join(process.cwd())
describe('getDependencyPaths', () => {
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
      'mf_isblank',
      'mm_createwebservice.sas',
      'mm_createstp.sas',
      'mm_getwebappsrvprops.sas',
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
      'mm_getrepos.sas',
      'mf_trimstr.sas'
    ]
    const dependencyPaths = await getDependencyPaths(fileContent)

    dependencyPaths.forEach((dep) => {
      expect(dependenciesList.some((x) => dep.includes(x))).toBeTruthy()
    })

    done()
  })

  test('it should throw an error when a dependency is not found', async (done) => {
    const missingDependency = './missing-dependency.sas'

    const fileContent = await readFile(path.join(__dirname, missingDependency))

    const dependencyPaths = await getDependencyPaths(fileContent)

    expect(
      dependencyPaths.find((dep) => dep.includes(missingDependency))
    ).toEqual(undefined)

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
