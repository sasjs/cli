import path from 'path'
import { Target } from '@sasjs/utils/types'
import * as internalModule from '../internal/config'
import * as compileModule from '../compile'
import { removeFromGlobalConfig } from '../../../utils/config'
import {
  createTestGlobalTarget,
  createTestMinimalApp,
  removeTestApp
} from '../../../utils/test'
import { generateTimestamp } from '../../../utils/utils'
import { loadDependencies } from '../internal/loadDependencies'

const fakeServiceInit = `/**
  @file serviceinit.sas
  @brief this file is called with every service
  @details  This file is included in *every* service, *after* the macros and *before* the service code.

  <h4> Dependencies </h4>
  @li mf_abort.sas

**/

options
  DATASTMTCHK=ALLKEYWORDS /* some sites have this enabled */
  PS=MAX /* reduce log size slightly */
;
%put service is starting!!;`

const fakeServiceTerm = `/**
  @file serviceterm.sas
  @brief this file is called at the end of every service
  @details  This file is included at the *end* of every service.

  <h4> Dependencies </h4>
  @li mf_abort.sas
  @li mf_existds.sas

**/

%put service is finishing.  Thanks, SASjs!;`

const fakeServiceInit2 = `/**
  @file serviceinit.sas
  @brief this file is called with every service
  @details  This file is included in *every* service, *after* the macros and *before* the service code.

  <h4> SAS Macros </h4>
  @li mf_abort.sas

**/

options
  DATASTMTCHK=ALLKEYWORDS /* some sites have this enabled */
  PS=MAX /* reduce log size slightly */
;
%put service is starting!!;`

const fakeServiceTerm2 = `/**
  @file serviceterm.sas
  @brief this file is called at the end of every service
  @details  This file is included at the *end* of every service.

  <h4> SAS Macros </h4>
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

  <h4> SAS Programs </h4>
  @li test.sas TEST

  <h4> SAS Macros </h4>
  @li example.sas

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

describe('loadDependencies', () => {
  let target: Target

  beforeAll(async () => {
    const appName = `cli-tests-load-dependencies-${generateTimestamp()}`
    target = await createTestGlobalTarget(appName, '/Public/app')
    await createTestMinimalApp(__dirname, target.name)
  })

  afterAll(async (done) => {
    await removeFromGlobalConfig(target.name)
    await removeTestApp(__dirname, target.name)
    done()
  })

  test('it should load dependencies for a service with <h4> Dependencies </h4>', async (done) => {
    spyOn(internalModule, 'getServiceInit').and.returnValue(
      `\n* ServiceInit start;\n${fakeServiceInit}\n* ServiceInit end;`
    )
    spyOn(internalModule, 'getServiceTerm').and.returnValue(
      `\n* ServiceTerm start;\n${fakeServiceTerm}\n* ServiceTerm end;`
    )

    const dependencies = await loadDependencies(
      target,
      path.join(__dirname, './service.sas'),
      [],
      [],
      'service'
    )

    expect(/\* ServiceInit start;/.test(dependencies)).toEqual(true)
    expect(/\* ServiceInit end;/.test(dependencies)).toEqual(true)
    expect(/\* ServiceTerm start;/.test(dependencies)).toEqual(true)
    expect(/\* ServiceTerm end;/.test(dependencies)).toEqual(true)
    expect(/%macro mf_abort/.test(dependencies)).toEqual(true)
    expect(/%macro mf_existds/.test(dependencies)).toEqual(true)

    done()
  })

  test('it should load dependencies for a job <h4> Dependencies </h4>', async (done) => {
    spyOn(internalModule, 'getJobInit').and.returnValue(
      `\n* JobInit start;\n${fakeServiceInit}\n* JobInit end;`
    )
    spyOn(internalModule, 'getJobTerm').and.returnValue(
      `\n* JobTerm start;\n${fakeServiceTerm}\n* JobTerm end;`
    )

    const dependencies = await loadDependencies(
      target,
      path.join(__dirname, './service.sas'),
      [],
      [],
      'job'
    )

    expect(/\* JobInit start;/.test(dependencies)).toEqual(true)
    expect(/\* JobInit end;/.test(dependencies)).toEqual(true)
    expect(/\* JobTerm start;/.test(dependencies)).toEqual(true)
    expect(/\* JobTerm end;/.test(dependencies)).toEqual(true)
    expect(/%macro mf_abort/.test(dependencies)).toEqual(true)
    expect(/%macro mf_existds/.test(dependencies)).toEqual(true)

    done()
  })

  test('it should load dependencies for a service with <h4> SAS MAcros </h4>', async (done) => {
    spyOn(internalModule, 'getServiceInit').and.returnValue(
      `\n* ServiceInit start;\n${fakeServiceInit2}\n* ServiceInit end;`
    )
    spyOn(internalModule, 'getServiceTerm').and.returnValue(
      `\n* ServiceTerm start;\n${fakeServiceTerm2}\n* ServiceTerm end;`
    )

    const dependencies = await loadDependencies(
      target,
      path.join(__dirname, './service.sas'),
      [],
      [],
      'service'
    )
    expect(/\* ServiceInit start;/.test(dependencies)).toEqual(true)
    expect(/\* ServiceInit end;/.test(dependencies)).toEqual(true)
    expect(/\* ServiceTerm start;/.test(dependencies)).toEqual(true)
    expect(/\* ServiceTerm end;/.test(dependencies)).toEqual(true)
    expect(/%macro mf_abort/.test(dependencies)).toEqual(true)
    expect(/%macro mf_existds/.test(dependencies)).toEqual(true)

    done()
  })

  test('it should load dependencies for a job <h4> SAS MAcros </h4>', async (done) => {
    spyOn(internalModule, 'getJobInit').and.returnValue(
      `\n* JobInit start;\n${fakeServiceInit2}\n* JobInit end;`
    )
    spyOn(internalModule, 'getJobTerm').and.returnValue(
      `\n* JobTerm start;\n${fakeServiceTerm2}\n* JobTerm end;`
    )

    const dependencies = await loadDependencies(
      target,
      path.join(__dirname, './service.sas'),
      [],
      [],
      'job'
    )

    expect(/\* JobInit start;/.test(dependencies)).toEqual(true)
    expect(/\* JobInit end;/.test(dependencies)).toEqual(true)
    expect(/\* JobTerm start;/.test(dependencies)).toEqual(true)
    expect(/\* JobTerm end;/.test(dependencies)).toEqual(true)
    expect(/%macro mf_abort/.test(dependencies)).toEqual(true)
    expect(/%macro mf_existds/.test(dependencies)).toEqual(true)

    done()
  })

  test("it should load dependencies for a job having jobInit's <h4> SAS Programs </h4>", async (done) => {
    spyOn(internalModule, 'getJobInit').and.returnValue(
      `\n* JobInit start;\n${fakeJobInit}\n* JobInit end;`
    )
    spyOn(internalModule, 'getJobTerm').and.returnValue(
      `\n* JobTerm start;\n${fakeServiceTerm2}\n* JobTerm end;`
    )

    const dependencies = await loadDependencies(
      target,
      path.join(__dirname, './service.sas'),
      [],
      ['../', '../services'],
      'job'
    )

    expect(/\* JobInit start;/.test(dependencies)).toEqual(true)
    expect(/\* JobInit end;/.test(dependencies)).toEqual(true)
    expect(/\* JobTerm start;/.test(dependencies)).toEqual(true)
    expect(/\* JobTerm end;/.test(dependencies)).toEqual(true)
    expect(/%macro mf_abort/.test(dependencies)).toEqual(true)
    expect(/%macro mf_existds/.test(dependencies)).toEqual(true)

    expect(dependencies).toEqual(
      expect.stringContaining(fakeProgramLines.join('\n'))
    )

    done()
  })

  test("it should load dependencies for a job having jobTerm's <h4> SAS Programs </h4>", async (done) => {
    spyOn(internalModule, 'getJobInit').and.returnValue(
      `\n* JobInit start;\n${fakeServiceInit2}\n* JobInit end;`
    )
    spyOn(internalModule, 'getJobTerm').and.returnValue(
      `\n* JobTerm start;\n${fakeJobInit}\n* JobTerm end;`
    )

    const dependencies = await loadDependencies(
      target,
      path.join(__dirname, './service.sas'),
      [],
      ['../', '../services'],
      'job'
    )

    expect(/\* JobInit start;/.test(dependencies)).toEqual(true)
    expect(/\* JobInit end;/.test(dependencies)).toEqual(true)
    expect(/\* JobTerm start;/.test(dependencies)).toEqual(true)
    expect(/\* JobTerm end;/.test(dependencies)).toEqual(true)
    expect(/%macro mf_abort/.test(dependencies)).toEqual(true)

    expect(dependencies).toEqual(
      expect.stringContaining(fakeProgramLines.join('\n'))
    )

    done()
  })

  test("it should load dependencies for a service having serviceInit's <h4> SAS Programs </h4>", async (done) => {
    spyOn(internalModule, 'getServiceInit').and.returnValue(
      `\n* ServiceInit start;\n${fakeJobInit}\n* ServiceInit end;`
    )
    spyOn(internalModule, 'getServiceTerm').and.returnValue(
      `\n* ServiceTerm start;\n${fakeServiceTerm2}\n* ServiceTerm end;`
    )

    const dependencies = await loadDependencies(
      target,
      path.join(__dirname, './service.sas'),
      [],
      ['../', '../services'],
      'service'
    )
    expect(/\* ServiceInit start;/.test(dependencies)).toEqual(true)
    expect(/\* ServiceInit end;/.test(dependencies)).toEqual(true)
    expect(/\* ServiceTerm start;/.test(dependencies)).toEqual(true)
    expect(/\* ServiceTerm end;/.test(dependencies)).toEqual(true)
    expect(/%macro mf_abort/.test(dependencies)).toEqual(true)
    expect(/%macro mf_existds/.test(dependencies)).toEqual(true)

    expect(dependencies).toEqual(
      expect.stringContaining(fakeProgramLines.join('\n'))
    )

    done()
  })

  test("it should load dependencies for a service having serviceTerm's <h4> SAS Programs </h4>", async (done) => {
    spyOn(internalModule, 'getServiceInit').and.returnValue(
      `\n* ServiceInit start;\n${fakeServiceInit2}\n* ServiceInit end;`
    )
    spyOn(internalModule, 'getServiceTerm').and.returnValue(
      `\n* ServiceTerm start;\n${fakeJobInit}\n* ServiceTerm end;`
    )

    const dependencies = await loadDependencies(
      target,
      path.join(__dirname, './service.sas'),
      [],
      ['../', '../services'],
      'service'
    )
    expect(/\* ServiceInit start;/.test(dependencies)).toEqual(true)
    expect(/\* ServiceInit end;/.test(dependencies)).toEqual(true)
    expect(/\* ServiceTerm start;/.test(dependencies)).toEqual(true)
    expect(/\* ServiceTerm end;/.test(dependencies)).toEqual(true)
    expect(/%macro mf_abort/.test(dependencies)).toEqual(true)

    expect(dependencies).toEqual(
      expect.stringContaining(fakeProgramLines.join('\n'))
    )

    done()
  })
})
