import path from 'path'
import * as compileModule from '../../../src/commands/build'

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

process.projectDir = path.join(process.cwd())
describe('loadDependencies', () => {
  test('it should load dependencies for a service', async (done) => {
    spyOn(compileModule, 'getServiceInit').and.returnValue(
      `\n* ServiceInit start;\n${fakeServiceInit}\n* ServiceInit end;`
    )
    spyOn(compileModule, 'getServiceTerm').and.returnValue(
      `\n* ServiceTerm start;\n${fakeServiceTerm}\n* ServiceTerm end;`
    )

    const dependencies = await compileModule.loadDependencies(
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

  test('it should load dependencies for a job', async (done) => {
    spyOn(compileModule, 'getJobInit').and.returnValue(
      `\n* JobInit start;\n${fakeServiceInit}\n* JobInit end;`
    )
    spyOn(compileModule, 'getJobTerm').and.returnValue(
      `\n* JobTerm start;\n${fakeServiceTerm}\n* JobTerm end;`
    )

    const dependencies = await compileModule.loadDependencies(
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
