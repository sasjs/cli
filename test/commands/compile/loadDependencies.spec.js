import path from 'path'
jest.unmock('../../../src/sasjs-build/index')
import { loadDependencies } from '../../../src/sasjs-build/index'

process.projectDir = path.join(process.cwd())
describe('loadDependencies', () => {
  test.todo('it should load dependencies for a service', async (done) => {
    const dependencies = await loadDependencies(
      path.join(__dirname, './service.sas'),
      [],
      [],
      'service'
    )

    console.log(dependencies)
    // TODO: Assert on the fact that dependencies text is included
    expect(true).toEqual(true)
    done()
  })

  test.todo('it should load dependencies for a job', async (done) => {
    const dependencies = await sasjsBuild.loadDependencies(
      path.join(__dirname, './service.sas'),
      [],
      [],
      'job'
    )

    console.log(dependencies)
    // TODO: Assert on the fact that dependencies text is included
    expect(true).toEqual(true)
    done()
  })
})
