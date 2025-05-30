import dotenv from 'dotenv'
import path from 'path'
import { runSasCode } from '../..'
import {
  copy,
  createFolder,
  deleteFolder,
  Target,
  generateTimestamp,
  ServerType
} from '@sasjs/utils'
import {
  createTestApp,
  createTestMinimalApp,
  generateTestTarget,
  removeTestApp,
  updateTarget,
  updateConfig,
  removeTestServerFolder
} from '../../../utils/test'
import { build } from '../../build/build'
import { setConstants } from '../../../utils'

describe('sasjs run with Viya', () => {
  let target: Target

  describe('runSasCode within project', () => {
    beforeEach(async () => {
      const appName = 'cli-tests-run-' + generateTimestamp()
      await createTestApp(__dirname, appName)
      target = generateTestTarget(
        appName,
        `/Public/app/cli-tests/${appName}`,
        {
          serviceFolders: [path.join('sasjs', 'testServices')],
          initProgram: '',
          termProgram: '',
          macroVars: {}
        },
        ServerType.SasViya
      )
      await copy(
        path.join(__dirname, 'testServices'),
        path.join(process.projectDir, 'sasjs', 'testServices')
      )
    })

    afterEach(async () => {
      await removeTestServerFolder(target.appLoc, target)
      await removeTestApp(__dirname, target.name)
    })

    it('should throw an error if file type is not *.sas', async () => {
      const file = 'test.sas.txt'
      const error = new Error(`'sasjs run' command supports only *.sas files.`)

      await expect(runSasCode(target, file)).rejects.toEqual(error)
    })

    it('should throw an error if url does not point to a webpage', async () => {
      const url = 'https://raw.githubusercontent.com/sasjs/cli/issues/808'
      await expect(runSasCode(target, url)).rejects.toThrow()
    })

    it('should throw an error if url response starts with angular bracket(<)', async () => {
      const url = 'https://github.com/sasjs/cli/issues/808'
      const { invalidSasError } = process.sasjsConstants
      const error = new Error(`${invalidSasError}\nUrl: ${url}`)
      await expect(runSasCode(target, url)).rejects.toThrowError(error)
    })

    it('should throw an error when url response is not a string', async () => {
      const url = 'https://api.agify.io/?name=sabir'
      const { invalidSasError } = process.sasjsConstants
      const error = new Error(`${invalidSasError}\nUrl: ${url}`)
      await expect(runSasCode(target, url)).rejects.toThrowError(error)
    })

    it('should get the log on successfull execution having relative path', async () => {
      const logPart = `1    data;\n2      do x=1 to 100;\n3        output;\n4      end;\n5    run;`

      const result: any = await runSasCode(
        target,
        'sasjs/testServices/logJob.sas'
      )

      expect(result.log.includes(logPart)).toBeTruthy()
    })

    it('should get the log on successfull execution having absolute path', async () => {
      const logPart = `1    data;\n2      do x=1 to 100;\n3        output;\n4      end;\n5    run;`

      const result: any = await runSasCode(
        target,
        `${process.projectDir}/sasjs/testServices/logJob.sas`
      )

      expect(result.log.includes(logPart)).toBeTruthy()
    })

    it('should get the log on successfull execution having relative path but compile it first', async () => {
      const logPartRegex =
        /[0-9]*  data;\n[0-9]*    do x=1 to 100;\n[0-9]*      output;\n[0-9]*    end;\n[0-9]*  run;\n/

      const result: any = await runSasCode(
        target,
        `sasjs/testServices/logJob.sas`,
        true
      )

      expect(logPartRegex.test(result.log)).toBeTruthy()
    })

    it('should get the log on successfull execution having absolute path but compile it first', async () => {
      const logPartRegex =
        /[0-9]*  data;\n[0-9]*    do x=1 to 100;\n[0-9]*      output;\n[0-9]*    end;\n[0-9]*  run;\n/

      const result: any = await runSasCode(
        target,
        `${process.projectDir}/sasjs/testServices/logJob.sas`,
        true
      )

      expect(logPartRegex.test(result.log)).toBeTruthy()
    })
  })

  describe('runSasCode outside project', () => {
    let sharedAppName: string
    const homedir = require('os').homedir()

    beforeAll(async () => {
      sharedAppName = `cli-tests-run-${generateTimestamp()}`
      await createTestApp(homedir, sharedAppName)
      await updateConfig(
        {
          macroFolders: [
            `./${sharedAppName}/sasjs/macros`,
            `./${sharedAppName}/sasjs/targets/viya/macros`
          ]
        },
        false
      )
    })

    beforeEach(async () => {
      const appName = `cli-tests-run-${generateTimestamp()}`
      target = generateTestTarget(
        appName,
        `/Public/app/cli-tests/${appName}`,
        {
          serviceFolders: [path.join(__dirname, 'testServices')],
          initProgram: '',
          termProgram: '',
          macroVars: {}
        },
        ServerType.SasViya
      )
      process.projectDir = ''
      await setConstants()
      process.currentDir = path.join(__dirname, appName)
      await createFolder(process.currentDir)
    })

    afterEach(async () => {
      await deleteFolder(process.currentDir)
      await removeTestServerFolder(target.appLoc, target)
    })

    afterAll(async () => {
      await removeTestApp(homedir, sharedAppName)
      await deleteFolder(path.join(homedir, 'sasjsbuild'))
      await deleteFolder(path.join(homedir, 'sasjsresults'))
    })

    it('should get the log on successfull execution having relative path', async () => {
      const logPart = `1    data;\n2      do x=1 to 100;\n3        output;\n4      end;\n5    run;`

      const result: any = await runSasCode(target, '../testServices/logJob.sas')

      expect(result.log.includes(logPart)).toBeTruthy()
    })

    it('should get the log on successfull execution having absolute path', async () => {
      const logPart = `1    data;\n2      do x=1 to 100;\n3        output;\n4      end;\n5    run;`

      const result: any = await runSasCode(
        target,
        `${__dirname}/testServices/logJob.sas`
      )

      expect(result.log.includes(logPart)).toBeTruthy()
    })

    it('should get the log on successfull execution having relative path but compile it first', async () => {
      const logPartRegex =
        /[0-9]*  data;\n[0-9]*    do x=1 to 100;\n[0-9]*      output;\n[0-9]*    end;\n[0-9]*  run;\n/

      const result: any = await runSasCode(
        target,
        '../testServices/logJob.sas',
        true
      )

      expect(logPartRegex.test(result.log)).toBeTruthy()
    })

    it('should get the log on successfull execution having absolute path but compile it first', async () => {
      const logPartRegex =
        /[0-9]*  data;\n[0-9]*    do x=1 to 100;\n[0-9]*      output;\n[0-9]*    end;\n[0-9]*  run;\n/

      const result: any = await runSasCode(
        target,
        `${__dirname}/testServices/logJob.sas`,
        true
      )

      expect(logPartRegex.test(result.log)).toBeTruthy()
    })
  })

  describe('runSasCode within vanilla js project', () => {
    let appName: string
    beforeEach(async () => {
      dotenv.config()
      appName = 'cli-tests-run-' + generateTimestamp()
      await createTestMinimalApp(__dirname, appName)
      target = await updateTarget(
        {
          appLoc: `/Public/app/cli-tests/${appName}`,
          streamConfig: {
            assetPaths: [],
            streamWeb: true,
            streamWebFolder: 'webv',
            webSourcePath: 'src',
            streamServiceName: 'clickme'
          },
          authConfig: {
            client: process.env.CLIENT as string,
            secret: process.env.SECRET as string,
            access_token: process.env.ACCESS_TOKEN as string,
            refresh_token: process.env.REFRESH_TOKEN as string
          }
        },
        'viya'
      )
    })

    afterEach(async () => {
      await removeTestServerFolder(target.appLoc, target)
      await removeTestApp(__dirname, appName)
    })

    it('should get the log having launch code message', async () => {
      const logPart = `SASjs Streaming App Created! Check it out here:\n      \n      \n      \n      \n      your-sas-server.com/SASJobExecution?_FILE=${target.appLoc}/services/clickme.html\n`
      await build(target)
      const result: any = await runSasCode(
        target,
        'sasjsbuild/myviyadeploy.sas'
      )

      expect(result.log.includes(logPart)).toBeTruthy()
    })
  })
})
