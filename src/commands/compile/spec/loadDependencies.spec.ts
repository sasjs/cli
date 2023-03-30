import path from 'path'
import {
  Target,
  generateTimestamp,
  JobConfig,
  ServiceConfig,
  ServerType,
  SASJsFileType,
  DependencyHeader,
  CompileTree,
  capitalizeFirstChar
} from '@sasjs/utils'
import * as internalModule from '@sasjs/utils/sasjsCli/getInitTerm'
import { mockGetProgram } from '@sasjs/utils/sasjsCli/getInitTerm'
import {
  generateTestTarget,
  createTestMinimalApp,
  removeTestApp,
  updateConfig
} from '../../../utils/test'
import { getLocalConfig, setConstants } from '../../../utils'
import { SasFileType } from '../internal'
import { loadDependencies, getCompileTree } from '../internal/loadDependencies'

const fakeInit = `/**
  @file serviceinit.sas
  @brief this file is called with every service
  @details  This file is included in *every* service, *after* the macros and *before* the service code.

  ${DependencyHeader.Macro}
  @li mf_abort.sas

**/

options
  DATASTMTCHK=ALLKEYWORDS /* some sites have this enabled */
  PS=MAX /* reduce log size slightly */
;
%put service is starting!!;`

const fakeTerm = `/**
  @file serviceterm.sas
  @brief this file is called at the end of every service
  @details  This file is included at the *end* of every service.

  ${DependencyHeader.Macro}
  @li mf_abort.sas
  @li mf_existds.sas

**/

%put service is finishing.  Thanks, SASjs!;`

const fakeInit2 = `/**
  @file serviceinit.sas
  @brief this file is called with every service
  @details  This file is included in *every* service, *after* the macros and *before* the service code.

  ${DependencyHeader.Macro}
  @li mf_abort.sas

**/

options
  DATASTMTCHK=ALLKEYWORDS /* some sites have this enabled */
  PS=MAX /* reduce log size slightly */
;
%put service is starting!!;`

const fakeTerm2 = `/**
  @file serviceterm.sas
  @brief this file is called at the end of every service
  @details  This file is included at the *end* of every service.

  ${DependencyHeader.Macro}
  @li mf_abort.sas
  @li mf_existds.sas

**/

%put service is finishing.  Thanks, SASjs!;`

const fakeJobInit = `/**
  @file
  @brief This code is inserted into the beginning of each Viya Job.
  @details Inserted during the \`sasjs compile\` step.  Add any code here that
  should go at the beginning of every deployed job.

  The path to this file should be listed in the \`jobInit\` property of the
  sasjsconfig file.

  ${DependencyHeader.DeprecatedInclude}
  @li test.sas TEST

  ${DependencyHeader.Macro}
  @li examplemacro.sas

**/

%example(Job Init is executing!)

%let mylib=WORK;`

const fakeJobInit2 = `/**
  @file
  @brief This code is inserted into the beginning of each Viya Job.
  @details Inserted during the \`sasjs compile\` step.  Add any code here that
  should go at the beginning of every deployed job.

  The path to this file should be listed in the \`jobInit\` property of the
  sasjsconfig file.

  ${DependencyHeader.Include}
  @li test.sas TEST

  ${DependencyHeader.Macro}
  @li examplemacro.sas

**/

%example(Job Init is executing!)

%let mylib=WORK;`

const fakeProgramLines = [
  'filename TEST temp;',
  'data _null_;',
  'file TEST lrecl=32767;',
  "put '%put ''Hello, world!'';';",
  'run;'
]

const jobConfig = (root: boolean = true): JobConfig => ({
  initProgram: '',
  termProgram: '',
  jobFolders: [],
  macroVars: root
    ? {
        macrovar1: 'macro job value configuration 1',
        macrovar2: 'macro job value configuration 2'
      }
    : {
        macrovar2: 'macro job value target 2',
        macrovar3: 'macro job value target 3'
      }
})

const serviceConfig = (root: boolean = true): ServiceConfig => ({
  initProgram: '',
  termProgram: '',
  serviceFolders: [],
  macroVars: root
    ? {
        macrovar1: 'macro service value configuration 1',
        macrovar2: 'macro service value configuration 2'
      }
    : {
        macrovar2: 'macro service value target 2',
        macrovar3: 'macro service value target 3'
      }
})

const compiledVars = (
  type: SasFileType.Job | SasFileType.Service
) => `* ${capitalizeFirstChar(type)} Variables start;

%let macrovar1=macro ${type.toLowerCase()} value configuration 1;
%let macrovar2=macro ${type.toLowerCase()} value target 2;
%let macrovar3=macro ${type.toLowerCase()} value target 3;

* ${capitalizeFirstChar(type)} Variables end;`

describe('loadDependencies', () => {
  const appName = `cli-tests-load-dependencies-${generateTimestamp()}`
  const temp: Target = generateTestTarget(
    appName,
    '/Public/app',
    {
      serviceFolders: [path.join('sasjs', 'services')],
      initProgram: '',
      termProgram: '',
      macroVars: {}
    },
    ServerType.SasViya
  )
  const target: Target = new Target({
    ...temp.toJson(),
    jobConfig: jobConfig(false),
    serviceConfig: serviceConfig(false)
  })
  let compileTree: CompileTree

  beforeAll(async () => {
    await setConstants(false)

    compileTree = getCompileTree(target)

    await createTestMinimalApp(__dirname, target.name)

    await updateConfig({
      jobConfig: jobConfig(),
      serviceConfig: serviceConfig()
    })

    process.sasjsConfig = await getLocalConfig()
  })

  afterAll(async () => {
    await removeTestApp(__dirname, target.name)
  })

  test(`it should load dependencies for a service with ${DependencyHeader.DeprecatedMacro}`, async () => {
    mockGetProgram(internalModule, fakeInit, fakeTerm)

    const dependencies = await loadDependencies(
      target,
      path.join(__dirname, './service.sas'),
      [],
      [],
      SASJsFileType.service,
      compileTree
    )

    expect(dependencies).toContain(compiledVars(SasFileType.Service))
    expect(/\* ServiceInit start;/.test(dependencies)).toEqual(true)
    expect(/\* ServiceInit end;/.test(dependencies)).toEqual(true)
    expect(/\* ServiceTerm start;/.test(dependencies)).toEqual(true)
    expect(/\* ServiceTerm end;/.test(dependencies)).toEqual(true)
    expect(/%macro mf_abort/.test(dependencies)).toEqual(true)
    expect(/%macro mf_existds/.test(dependencies)).toEqual(true)
  })

  test(`it should load dependencies for a job ${DependencyHeader.Macro}`, async () => {
    mockGetProgram(internalModule, fakeInit, fakeTerm)

    const dependencies = await loadDependencies(
      target,
      path.join(__dirname, './service.sas'),
      [],
      [],
      SASJsFileType.job,
      compileTree
    )

    expect(dependencies).toContain(compiledVars(SasFileType.Job))
    expect(/\* JobInit start;/.test(dependencies)).toEqual(true)
    expect(/\* JobInit end;/.test(dependencies)).toEqual(true)
    expect(/\* JobTerm start;/.test(dependencies)).toEqual(true)
    expect(/\* JobTerm end;/.test(dependencies)).toEqual(true)
    expect(/%macro mf_abort/.test(dependencies)).toEqual(true)
    expect(/%macro mf_existds/.test(dependencies)).toEqual(true)
  })

  test(`it should load dependencies for a service with ${DependencyHeader.Macro}`, async () => {
    mockGetProgram(internalModule, fakeInit2, fakeTerm2)

    const dependencies = await loadDependencies(
      target,
      path.join(__dirname, './service.sas'),
      [],
      [],
      SASJsFileType.service,
      compileTree
    )

    expect(dependencies).toContain(compiledVars(SasFileType.Service))
    expect(/\* ServiceInit start;/.test(dependencies)).toEqual(true)
    expect(/\* ServiceInit end;/.test(dependencies)).toEqual(true)
    expect(/\* ServiceTerm start;/.test(dependencies)).toEqual(true)
    expect(/\* ServiceTerm end;/.test(dependencies)).toEqual(true)
    expect(/%macro mf_abort/.test(dependencies)).toEqual(true)
    expect(/%macro mf_existds/.test(dependencies)).toEqual(true)
  })

  test(`it should load dependencies for a job ${DependencyHeader.Macro}`, async () => {
    mockGetProgram(internalModule, fakeInit2, fakeTerm2)

    const dependencies = await loadDependencies(
      target,
      path.join(__dirname, './service.sas'),
      [],
      [],
      SASJsFileType.job,
      compileTree
    )

    expect(dependencies).toContain(compiledVars(SasFileType.Job))
    expect(/\* JobInit start;/.test(dependencies)).toEqual(true)
    expect(/\* JobInit end;/.test(dependencies)).toEqual(true)
    expect(/\* JobTerm start;/.test(dependencies)).toEqual(true)
    expect(/\* JobTerm end;/.test(dependencies)).toEqual(true)
    expect(/%macro mf_abort/.test(dependencies)).toEqual(true)
    expect(/%macro mf_existds/.test(dependencies)).toEqual(true)
  })

  test(`it should load programs for a service with ${DependencyHeader.DeprecatedInclude}`, async () => {
    mockGetProgram(internalModule, fakeJobInit, fakeTerm)

    const dependencies = await loadDependencies(
      target,
      path.join(__dirname, './service.sas'),
      [path.join(__dirname, './macros')],
      [path.join(__dirname, './'), path.join(__dirname, './services')],
      SASJsFileType.service,
      compileTree
    )

    expect(dependencies).toContain(compiledVars(SasFileType.Service))
    expect(/\* ServiceInit start;/.test(dependencies)).toEqual(true)
    expect(/\* ServiceInit end;/.test(dependencies)).toEqual(true)
    expect(/\* ServiceTerm start;/.test(dependencies)).toEqual(true)
    expect(/\* ServiceTerm end;/.test(dependencies)).toEqual(true)
    expect(/%macro mf_abort/.test(dependencies)).toEqual(true)
    expect(/%macro mf_existds/.test(dependencies)).toEqual(true)
  })

  test(`it should load programs for a job ${DependencyHeader.DeprecatedInclude}`, async () => {
    mockGetProgram(internalModule, fakeJobInit, fakeTerm)

    const dependencies = await loadDependencies(
      target,
      path.join(__dirname, './service.sas'),
      [path.join(__dirname, './macros')],
      [path.join(__dirname, './'), path.join(__dirname, './services')],
      SASJsFileType.job,
      compileTree
    )

    expect(dependencies).toContain(compiledVars(SasFileType.Job))
    expect(/\* JobInit start;/.test(dependencies)).toEqual(true)
    expect(/\* JobInit end;/.test(dependencies)).toEqual(true)
    expect(/\* JobTerm start;/.test(dependencies)).toEqual(true)
    expect(/\* JobTerm end;/.test(dependencies)).toEqual(true)
    expect(/%macro mf_abort/.test(dependencies)).toEqual(true)
    expect(/%macro mf_existds/.test(dependencies)).toEqual(true)
  })

  test(`it should load programs for a service with ${DependencyHeader.Include}`, async () => {
    mockGetProgram(internalModule, fakeJobInit2, fakeTerm2)

    const dependencies = await loadDependencies(
      target,
      path.join(__dirname, './service.sas'),
      [path.join(__dirname, './macros')],
      [path.join(__dirname, './'), path.join(__dirname, './services')],
      SASJsFileType.service,
      compileTree
    )

    expect(dependencies).toContain(compiledVars(SasFileType.Service))
    expect(/\* ServiceInit start;/.test(dependencies)).toEqual(true)
    expect(/\* ServiceInit end;/.test(dependencies)).toEqual(true)
    expect(/\* ServiceTerm start;/.test(dependencies)).toEqual(true)
    expect(/\* ServiceTerm end;/.test(dependencies)).toEqual(true)
    expect(/%macro mf_abort/.test(dependencies)).toEqual(true)
    expect(/%macro mf_existds/.test(dependencies)).toEqual(true)
  })

  test(`it should load programs for a job ${DependencyHeader.Include}`, async () => {
    mockGetProgram(internalModule, fakeJobInit2, fakeTerm2)

    const dependencies = await loadDependencies(
      target,
      path.join(__dirname, './service.sas'),
      [path.join(__dirname, './macros')],
      [path.join(__dirname, './'), path.join(__dirname, './services')],
      SASJsFileType.job,
      compileTree
    )

    expect(dependencies).toContain(compiledVars(SasFileType.Job))
    expect(/\* JobInit start;/.test(dependencies)).toEqual(true)
    expect(/\* JobInit end;/.test(dependencies)).toEqual(true)
    expect(/\* JobTerm start;/.test(dependencies)).toEqual(true)
    expect(/\* JobTerm end;/.test(dependencies)).toEqual(true)
    expect(/%macro mf_abort/.test(dependencies)).toEqual(true)
    expect(/%macro mf_existds/.test(dependencies)).toEqual(true)
  })

  test(`it should load dependencies for a job having jobInit's ${DependencyHeader.DeprecatedInclude}`, async () => {
    mockGetProgram(internalModule, fakeJobInit, fakeTerm2)

    const dependencies = await loadDependencies(
      target,
      path.join(__dirname, './service.sas'),
      [path.join(__dirname, './macros')],
      [path.join(__dirname, './'), path.join(__dirname, './services')],
      SASJsFileType.job,
      compileTree
    )

    expect(dependencies).toContain(compiledVars(SasFileType.Job))
    expect(/\* JobInit start;/.test(dependencies)).toEqual(true)
    expect(/\* JobInit end;/.test(dependencies)).toEqual(true)
    expect(/\* JobTerm start;/.test(dependencies)).toEqual(true)
    expect(/\* JobTerm end;/.test(dependencies)).toEqual(true)
    expect(/%macro examplemacro/.test(dependencies)).toEqual(true)
    expect(/%macro doesnothing/.test(dependencies)).toEqual(true)
    expect(/%macro mf_abort/.test(dependencies)).toEqual(true)
    expect(/%macro mf_existds/.test(dependencies)).toEqual(true)

    expect(dependencies).toEqual(
      expect.stringContaining(fakeProgramLines.join('\n'))
    )
  })

  test(`it should load dependencies for a job having jobTerm's ${DependencyHeader.DeprecatedInclude}`, async () => {
    mockGetProgram(internalModule, fakeInit2, fakeJobInit)

    const dependencies = await loadDependencies(
      target,
      path.join(__dirname, './service.sas'),
      [path.join(__dirname, './macros')],
      [path.join(__dirname, './'), path.join(__dirname, './services')],
      SASJsFileType.job,
      compileTree
    )

    expect(dependencies).toContain(compiledVars(SasFileType.Job))
    expect(/\* JobInit start;/.test(dependencies)).toEqual(true)
    expect(/\* JobInit end;/.test(dependencies)).toEqual(true)
    expect(/\* JobTerm start;/.test(dependencies)).toEqual(true)
    expect(/\* JobTerm end;/.test(dependencies)).toEqual(true)
    expect(/%macro examplemacro/.test(dependencies)).toEqual(true)
    expect(/%macro doesnothing/.test(dependencies)).toEqual(true)
    expect(/%macro mf_abort/.test(dependencies)).toEqual(true)

    expect(dependencies).toEqual(
      expect.stringContaining(fakeProgramLines.join('\n'))
    )
  })

  test(`it should load dependencies for a service having serviceInit's ${DependencyHeader.DeprecatedInclude}`, async () => {
    mockGetProgram(internalModule, fakeJobInit, fakeTerm2)

    const dependencies = await loadDependencies(
      target,
      path.join(__dirname, './service.sas'),
      [path.join(__dirname, './macros')],
      [path.join(__dirname, './'), path.join(__dirname, './services')],
      SASJsFileType.service,
      compileTree
    )

    expect(dependencies).toContain(compiledVars(SasFileType.Service))
    expect(/\* ServiceInit start;/.test(dependencies)).toEqual(true)
    expect(/\* ServiceInit end;/.test(dependencies)).toEqual(true)
    expect(/\* ServiceTerm start;/.test(dependencies)).toEqual(true)
    expect(/\* ServiceTerm end;/.test(dependencies)).toEqual(true)
    expect(/%macro examplemacro/.test(dependencies)).toEqual(true)
    expect(/%macro doesnothing/.test(dependencies)).toEqual(true)
    expect(/%macro mf_abort/.test(dependencies)).toEqual(true)
    expect(/%macro mf_existds/.test(dependencies)).toEqual(true)

    expect(dependencies).toEqual(
      expect.stringContaining(fakeProgramLines.join('\n'))
    )
  })

  test(`it should load dependencies for a service having serviceTerm's ${DependencyHeader.DeprecatedInclude}`, async () => {
    mockGetProgram(internalModule, fakeInit2, fakeJobInit)

    const dependencies = await loadDependencies(
      target,
      path.join(__dirname, './service.sas'),
      [path.join(__dirname, './macros')],
      [path.join(__dirname, './'), path.join(__dirname, './services')],
      SASJsFileType.service,
      compileTree
    )

    expect(dependencies).toContain(compiledVars(SasFileType.Service))
    expect(/\* ServiceInit start;/.test(dependencies)).toEqual(true)
    expect(/\* ServiceInit end;/.test(dependencies)).toEqual(true)
    expect(/\* ServiceTerm start;/.test(dependencies)).toEqual(true)
    expect(/\* ServiceTerm end;/.test(dependencies)).toEqual(true)
    expect(/%macro examplemacro/.test(dependencies)).toEqual(true)
    expect(/%macro doesnothing/.test(dependencies)).toEqual(true)
    expect(/%macro mf_abort/.test(dependencies)).toEqual(true)

    expect(dependencies).toEqual(
      expect.stringContaining(fakeProgramLines.join('\n'))
    )
  })
})
