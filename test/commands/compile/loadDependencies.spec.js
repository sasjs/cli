import path from 'path'
import * as compileModule from '../../../src/sasjs-build/index'

process.projectDir = path.join(process.cwd())
describe('loadDependencies', () => {
  test('it should load dependencies for a service', async (done) => {
    spyOn(compileModule, 'getServiceInit').and.returnValue(
      '\n* ServiceInit start;\nFAKE SERVICE INIT\n* ServiceInit end;'
    )
    spyOn(compileModule, 'getServiceTerm').and.returnValue(
      '\n* ServiceTerm start;\nFAKE SERVICE TERM\n* ServiceTerm end;'
    )

    const dependencies = await compileModule.loadDependencies(
      path.join(__dirname, './service.sas'),
      [],
      [],
      'service'
    )

    expect(
      /\* ServiceInit start;\nFAKE SERVICE INIT\n\* ServiceInit end;/.test(
        dependencies
      )
    ).toEqual(true)
    expect(
      /\* ServiceTerm start;\nFAKE SERVICE TERM\n\* ServiceTerm end;/.test(
        dependencies
      )
    ).toEqual(true)

    done()
  })

  test('it should load dependencies for a job', async (done) => {
    spyOn(compileModule, 'getJobTerm').and.returnValue(
      '\n* JobTerm start;\nFAKE JOB TERM\n* JobTerm end;'
    )
    spyOn(compileModule, 'getJobInit').and.returnValue(
      '\n* JobInit start;\nFAKE JOB INIT\n* JobInit end;'
    )

    const dependencies = await compileModule.loadDependencies(
      path.join(__dirname, './service.sas'),
      [],
      [],
      'job'
    )

    expect(
      /\* JobTerm start;\nFAKE JOB TERM\n\* JobTerm end;/.test(dependencies)
    ).toEqual(true)
    expect(
      /\* JobInit start;\nFAKE JOB INIT\n\* JobInit end;/.test(dependencies)
    ).toEqual(true)

    done()
  })
})
