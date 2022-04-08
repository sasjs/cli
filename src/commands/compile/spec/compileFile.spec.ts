import path from 'path'
import {
  Target,
  generateTimestamp,
  ServerType,
  DependencyHeader,
  SASJsFileType
} from '@sasjs/utils'
import * as internalModule from '@sasjs/utils/sasjsCli/getInitTerm'
import { mockGetProgram } from '@sasjs/utils/sasjsCli/getInitTerm'
import {
  generateTestTarget,
  createTestMinimalApp,
  removeTestApp,
  verifyCompiledService,
  verifyCompiledJob
} from '../../../utils/test'
import { compileFile } from '../internal/compileFile'
import { copy, fileExists, createFolder, readFile } from '@sasjs/utils'
import { getCompileTree } from '../internal/loadDependencies'

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

const fakeJobTerm = `/**
  @file serviceterm.sas
  @brief this file is called at the end of every service
  @details  This file is included at the *end* of every service.

  ${DependencyHeader.Macro}
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

describe('compileFile', () => {
  const appName = `cli-tests-compile-service-file-${generateTimestamp()}`
  const target: Target = generateTestTarget(
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

  beforeAll(async () => {
    await createTestMinimalApp(__dirname, target.name)
  })

  afterAll(async () => {
    await removeTestApp(__dirname, target.name)
  })

  describe('service', () => {
    test('it should compile and create file', async () => {
      mockGetProgram(internalModule, fakeJobInit, fakeJobTerm)

      const filePath = path.join(__dirname, './service.sas')
      const buildPath = path.join(process.projectDir, 'sasjsbuild')
      const destinationPath = path.join(buildPath, 'service.sas')
      const compileTree = getCompileTree(target)

      await createFolder(buildPath)
      await copy(filePath, destinationPath)

      await expect(
        compileFile(
          target,
          destinationPath,
          [path.join(__dirname, './macros')],
          [path.join(__dirname, './'), path.join(__dirname, './services')],
          undefined,
          compileTree,
          SASJsFileType.service,
          __dirname
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
    })
  })

  describe('job', () => {
    test('it should compile and create file', async () => {
      mockGetProgram(internalModule, fakeJobInit, fakeJobTerm)

      const filePath = path.join(__dirname, './service.sas')
      const buildPath = path.join(process.projectDir, 'sasjsbuild')
      const destinationPath = path.join(buildPath, 'service.sas')
      const compileTree = getCompileTree(target)

      await createFolder(buildPath)
      await copy(filePath, destinationPath)

      await expect(
        compileFile(
          target,
          destinationPath,
          [path.join(__dirname, './macros')],
          [path.join(__dirname, './'), path.join(__dirname, './services')],
          undefined,
          compileTree,
          SASJsFileType.job,
          __dirname
        )
      ).toResolve()

      await expect(fileExists(destinationPath)).resolves.toEqual(true)

      const compiledContent = await readFile(destinationPath)

      const macrosToTest: string[] = ['mf_abort', 'mf_existds']
      await verifyCompiledJob(compiledContent, macrosToTest)

      expect(compiledContent).toEqual(
        expect.stringContaining(fakeProgramLines.join('\n'))
      )
    })
  })
})
