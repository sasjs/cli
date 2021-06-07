import path from 'path'
import { Target, generateTimestamp } from '@sasjs/utils'
import * as internalModule from '../internal/config'
import { removeFromGlobalConfig } from '../../../utils/config'
import {
  createTestGlobalTarget,
  createTestMinimalApp,
  removeTestApp,
  verifyCompiledService
} from '../../../utils/test'
import { compileServiceFile } from '../internal/compileServiceFile'
import { copy, fileExists, createFolder, readFile } from '../../../utils/file'

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
  @li examplemacro.sas

**/

%example(Job Init is executing!)

%let mylib=WORK;`

const fakeJobTerm = `/**
  @file serviceterm.sas
  @brief this file is called at the end of every service
  @details  This file is included at the *end* of every service.

  <h4> SAS Macros </h4>
  @li mf_abort.sas
  @li mf_existds.sas

**/

%put service is finishing.  Thanks, SASjs!;`

const fakeProgramLines = [
  'filename TEST temp;',
  'data _null_;',
  'file TEST lrecl=32767;',
  "put '%put ''Hello, world!'';';",
  'run;'
]

const preCode =
  '/* provide additional debug info */\n%global _program;\n%put &=syscc;\n%put user=%mf_getuser();\n%put pgm=&_program;\n%put timestamp=%sysfunc(datetime(),datetime19.);\n'

describe('compileServiceFile', () => {
  let target: Target

  beforeAll(async () => {
    const appName = `cli-tests-compile-service-file-${generateTimestamp()}`
    target = await createTestGlobalTarget(appName, '/Public/app')
    await createTestMinimalApp(__dirname, target.name)
  })

  afterAll(async (done) => {
    await removeFromGlobalConfig(target.name)
    await removeTestApp(__dirname, target.name)
    done()
  })

  test('it should compile and create file', async (done) => {
    spyOn(internalModule, 'getServiceInit').and.returnValue({
      content: `\n* ServiceInit start;\n${fakeJobInit}\n* ServiceInit end;`,
      filePath: ''
    })
    spyOn(internalModule, 'getServiceTerm').and.returnValue({
      content: `\n* ServiceTerm start;\n${fakeJobTerm}\n* ServiceTerm end;`,
      filePath: ''
    })

    const filePath = path.join(__dirname, './service.sas')
    const buildPath = path.join(process.projectDir, 'sasjsbuild')
    const destinationPath = path.join(buildPath, 'service.sas')

    await createFolder(buildPath)

    await copy(filePath, destinationPath)

    await expect(
      compileServiceFile(
        target,
        destinationPath,
        [path.join(__dirname, './macros')],
        [path.join(__dirname, './'), path.join(__dirname, './services')]
      )
    ).toResolve()

    await expect(fileExists(destinationPath)).resolves.toEqual(true)

    const compiledContent = await readFile(destinationPath)

    const macrosToTest: string[] = ['mf_abort', 'mf_existds']
    await verifyCompiledService(compiledContent, macrosToTest)

    expect(compiledContent).toEqual(
      expect.stringContaining(fakeProgramLines.join('\n'))
    )
    expect(compiledContent).toEqual(expect.stringContaining(preCode))

    done()
  })
})
