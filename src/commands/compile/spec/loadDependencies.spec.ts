import path from 'path'
import { Target, ServerType } from '@sasjs/utils/types'
import * as internalModule from '../internal/config'
import * as compileModule from '../compile'

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

const target = new Target({
  name: 'load-dependencies-test',
  serverType: ServerType.SasViya,
  serverUrl: '',
  appLoc: '/test'
})

process.projectDir = path.join(process.cwd())
describe('loadDependencies', () => {
  test('it should load dependencies for a service with <h4> Dependencies </h4>', async (done) => {
    spyOn(internalModule, 'getServiceInit').and.returnValue(
      `\n* ServiceInit start;\n${fakeServiceInit}\n* ServiceInit end;`
    )
    spyOn(internalModule, 'getServiceTerm').and.returnValue(
      `\n* ServiceTerm start;\n${fakeServiceTerm}\n* ServiceTerm end;`
    )

    const dependencies = await compileModule.loadDependencies(
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

    const dependencies = await compileModule.loadDependencies(
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

    const dependencies = await compileModule.loadDependencies(
      target,
      path.join(__dirname, './service.sas'),
      [],
      [],
      'service'
    )
    console.log(dependencies)
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

    const dependencies = await compileModule.loadDependencies(
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
})
