import path from 'path'
import { readFile } from '../src/utils/file-utils'
import {
  getDependencyPaths,
  getProgramDependencies,
  prioritiseDependencyOverrides
} from '../src/sasjs-build/index'

process.projectDir = path.join(process.cwd())
describe('getProgramDependencies', () => {
  const expectedLines = [
    'filename TEST temp;',
    'data _null;',
    'file TEST lrecl=32767;',
    "put '%put ''Hello, world!'';';",
    'run;'
  ]

  test('it should get all program dependencies', async (done) => {
    const fileContent = await readFile(path.join(__dirname, './example.sas'))

    const dependencies = await getProgramDependencies(fileContent, __dirname)
    const actualLines = dependencies.split('\n')

    expect(actualLines).toEqual(expectedLines)
    done()
  })

  describe('it should ignore case variations in header', () => {
    test('should get program dependencies when header is lowercase', async (done) => {
      let fileContent = await readFile(path.join(__dirname, './example.sas'))
      fileContent = fileContent.replace('SAS Programs', 'sas programs')

      const dependencies = await getProgramDependencies(fileContent, __dirname)
      const actualLines = dependencies.split('\n')

      expect(actualLines).toEqual(expectedLines)
      done()
    })

    test('should get program dependencies when header is uppercase', async (done) => {
      let fileContent = await readFile(path.join(__dirname, './example.sas'))
      fileContent = fileContent.replace('SAS Programs', 'SAS PROGRAMS')

      const dependencies = await getProgramDependencies(fileContent, __dirname)
      const actualLines = dependencies.split('\n')

      expect(actualLines).toEqual(expectedLines)
      done()
    })

    test('should get program dependencies when header is mixed case', async (done) => {
      let fileContent = await readFile(path.join(__dirname, './example.sas'))
      fileContent = fileContent.replace('SAS Programs', 'sas PROGRaMS')

      const dependencies = await getProgramDependencies(fileContent, __dirname)
      const actualLines = dependencies.split('\n')

      expect(actualLines).toEqual(expectedLines)
      done()
    })
  })
})
