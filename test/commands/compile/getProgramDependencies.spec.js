import path from 'path'
import { readFile } from '../../../src/utils/file-utils'
import {
  getProgramDependencies,
  getProgramList,
  validateFileRef,
  validateProgramsList
} from '../../../src/sasjs-build/index'

process.projectDir = path.join(process.cwd())
describe('getProgramDependencies', () => {
  const expectedLines = [
    'filename TEST temp;',
    'data _null_;',
    'file TEST lrecl=32767;',
    "put '%put ''Hello, world!'';';",
    'run;'
  ]

  test('it should get all program dependencies', async (done) => {
    const fileContent = await readFile(path.join(__dirname, './example.sas'))

    const dependencies = await getProgramDependencies(
      fileContent,
      ['programs'],
      __dirname
    )
    const actualLines = dependencies.split('\n')

    expect(actualLines).toEqual(expectedLines)
    done()
  })

  test('it should choose the first dependency when there are duplicates', async (done) => {
    const fileContent = await readFile(path.join(__dirname, './duplicates.sas'))

    const dependencies = await getProgramDependencies(
      fileContent,
      ['programs'],
      __dirname
    )
    const actualLines = dependencies.split('\n')

    expect(actualLines).toEqual(expectedLines)
    done()
  })

  test('it should handle duplicate filenames with different extensions', async (done) => {
    const fileContent = await readFile(
      path.join(__dirname, './duplicates-extensions.sas')
    )
    const expectedOutput = [
      'filename TEST temp;',
      'data _null_;',
      'file TEST lrecl=32767;',
      "put '%put ''Hello, world!'';';",
      'run;',
      'filename TEST2 temp;',
      'data _null_;',
      'file TEST2 lrecl=32767;',
      "put 'proc sql;';",
      "put 'quit;';",
      'run;'
    ]

    const dependencies = await getProgramDependencies(
      fileContent,
      ['programs'],
      __dirname
    )
    const actualLines = dependencies.split('\n')

    expect(actualLines).toEqual(expectedOutput)
    done()
  })

  test('it should throw an error when a fileref is not specified', async (done) => {
    const fileContent = await readFile(
      path.join(__dirname, './missing-fileref.sas')
    )

    await expect(
      getProgramDependencies(fileContent, ['programs'], __dirname)
    ).rejects.toThrow(
      `SAS Program test.sas is missing fileref. Please specify SAS program dependencies in the format: @li <filename> <fileref>`
    )
    done()
  })
})

describe('validateFileRef', () => {
  test('it should return true for a file ref containing characters', () => {
    const fileRef = 'TEST'

    expect(validateFileRef(fileRef)).toBeTruthy()
  })

  test('it should return true for a file ref containing characters and underscores', () => {
    const fileRef = 'TES_T'

    expect(validateFileRef(fileRef)).toBeTruthy()
  })

  test('it should return true for a file ref containing characters, numbers and underscores', () => {
    const fileRef = 'TES_T12'

    expect(validateFileRef(fileRef)).toBeTruthy()
  })

  test('it should return true for a file ref starting with an underscore', () => {
    const fileRef = '_TES_T12'

    expect(validateFileRef(fileRef)).toBeTruthy()
  })

  test('it should throw an error when the file ref is too long', () => {
    const fileRef = '_TES_T12435'

    expect(() => validateFileRef(fileRef)).toThrow(
      'File ref is too long. File refs can have a maximum of 8 characters.'
    )
  })

  test('it should throw an error when the file ref is falsy', () => {
    const fileRef = ''

    expect(() => validateFileRef(fileRef)).toThrow('Missing file ref.')
  })

  test('it should throw an error when the file ref does not conform to specifications', () => {
    const fileRef = '123ASDF'

    expect(() => validateFileRef(fileRef)).toThrow(
      'Invalid file ref. File refs can only start with a letter or an underscore, and contain only letters, numbers and underscores.'
    )
  })
})

describe('getProgramList', () => {
  test('should get program dependencies when header is lowercase', async (done) => {
    let fileContent = await readFile(path.join(__dirname, './example.sas'))
    fileContent = fileContent.replace('SAS Programs', 'sas programs')
    const expectedList = [{ fileName: 'test.sas', fileRef: 'TEST' }]

    const actualList = await getProgramList(fileContent)

    expect(actualList).toEqual(expectedList)
    done()
  })

  test('should get program dependencies when header is uppercase', async (done) => {
    let fileContent = await readFile(path.join(__dirname, './example.sas'))
    fileContent = fileContent.replace('SAS Programs', 'SAS PROGRAMS')
    const expectedList = [{ fileName: 'test.sas', fileRef: 'TEST' }]

    const actualList = await getProgramList(fileContent)

    expect(actualList).toEqual(expectedList)
    done()
  })

  test('it should handle empty programs list', async (done) => {
    const fileContent = await readFile(path.join(__dirname, './empty-list.sas'))
    const expectedOutput = []
    const actualList = await getProgramList(fileContent)

    expect(actualList).toEqual(expectedOutput)
    done()
  })

  test('should return empty list when file header is not present', async (done) => {
    let fileContent = await readFile(path.join(__dirname, './no-header.sas'))
    const expectedList = []

    const actualList = await getProgramList(fileContent)

    expect(actualList).toEqual(expectedList)
    done()
  })

  test('should get program dependencies when header is mixed case', async (done) => {
    let fileContent = await readFile(path.join(__dirname, './example.sas'))
    fileContent = fileContent.replace('SAS Programs', 'sas PROGRaMS')
    const expectedList = [{ fileName: 'test.sas', fileRef: 'TEST' }]

    const actualList = await getProgramList(fileContent)

    expect(actualList).toEqual(expectedList)
    done()
  })

  test('it should choose the first dependency when there are duplicates', async (done) => {
    const fileContent = await readFile(path.join(__dirname, './duplicates.sas'))
    const expectedList = [{ fileName: 'test.sas', fileRef: 'TEST' }]

    const actualList = await getProgramList(fileContent)

    expect(actualList).toEqual(expectedList)
    done()
  })
})

describe('validateProgramsList', () => {
  test('it should throw an error when filerefs are not unique', () => {
    const programsList = [
      { fileName: 'test.sas', fileRef: 'TEST' },
      { fileName: 'test2.sas', fileRef: 'TEST' },
      { fileName: 'test3.sas', fileRef: 'TEST' }
    ]

    expect(() => validateProgramsList(programsList)).toThrow(
      `The following files have duplicate fileref 'TEST':\ntest2.sas, test3.sas, test.sas\n`
    )
  })

  test('it should recognise non-unique filerefs regardless of case', () => {
    const programsList = [
      { fileName: 'test.sas', fileRef: 'TEST' },
      { fileName: 'test2.sas', fileRef: 'test' }
    ]

    expect(() => validateProgramsList(programsList)).toThrow(
      `The following files have duplicate fileref 'TEST':\ntest2.sas, test.sas\n`
    )
  })

  test('it should list all files with non-unique filerefs', () => {
    const programsList = [
      { fileName: 'test.sas', fileRef: 'TEST' },
      { fileName: 'test2.sas', fileRef: 'TEST' },
      { fileName: 'test3.sas', fileRef: 'TEST2' },
      { fileName: 'test4.sas', fileRef: 'TEST2' }
    ]

    expect(() => validateProgramsList(programsList)).toThrow(
      `The following files have duplicate fileref 'TEST':\ntest2.sas, test.sas\nThe following files have duplicate fileref 'TEST2':\ntest4.sas, test3.sas`
    )
  })
})
