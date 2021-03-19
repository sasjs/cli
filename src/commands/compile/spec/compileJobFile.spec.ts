import path from 'path'
import { Target } from '@sasjs/utils/types'
import * as internalModule from '../internal/config'
import * as compileModule from '../compile'
import { removeFromGlobalConfig } from '../../../utils/config'
import {
  createTestGlobalTarget,
  createTestMinimalApp,
  removeTestApp,
  verifyCompiledJob
} from '../../../utils/test'
import { generateTimestamp } from '../../../utils/utils'
import { compileJobFile } from '../internal/compileJobFile'
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

describe('compileJobFile', () => {
  let target: Target

  beforeAll(async () => {
    const appName = `cli-tests-compile-job-file-${generateTimestamp()}`
    target = await createTestGlobalTarget(appName, '/Public/app')
    await createTestMinimalApp(__dirname, target.name)
  })

  afterAll(async (done) => {
    await removeFromGlobalConfig(target.name)
    await removeTestApp(__dirname, target.name)
    done()
  })

  test('it should compile and create file', async (done) => {
    spyOn(internalModule, 'getJobInit').and.returnValue({
      content: `\n* JobInit start;\n${fakeJobInit}\n* JobInit end;`,
      filepath: ''
    })
    spyOn(internalModule, 'getJobTerm').and.returnValue({
      content: `\n* JobTerm start;\n${fakeJobTerm}\n* JobTerm end;`,
      filepath: ''
    })

    const filePath = path.join(__dirname, './service.sas')
    const buildPath = path.join(process.projectDir, 'sasjsbuild')
    const destinationPath = path.join(buildPath, 'service.sas')

    await createFolder(buildPath)

    await copy(filePath, destinationPath)

    await expect(
      compileJobFile(
        target,
        destinationPath,
        ['../macros'],
        ['../', '../services']
      )
    ).toResolve()

    await expect(fileExists(destinationPath)).resolves.toEqual(true)

    const compiledContent = await readFile(destinationPath)

    const macrosToTest: string[] = ['mf_abort', 'mf_existds']
    await verifyCompiledJob(compiledContent, macrosToTest)

    expect(compiledContent).toEqual(
      expect.stringContaining(fakeProgramLines.join('\n'))
    )

    done()
  })
})
