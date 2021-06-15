import dotenv from 'dotenv'
import path from 'path'
import { folder, runSasCode } from '../..'
import {
  copy,
  createFolder,
  deleteFolder,
  Target,
  generateTimestamp,
  ServerType
} from '@sasjs/utils'
import { Command } from '../../../utils/command'
import { saveGlobalRcFile, removeFromGlobalConfig } from '../../../utils/config'
import {
  createTestApp,
  createTestMinimalApp,
  createTestGlobalTarget,
  removeTestApp,
  updateTarget,
  updateConfig
} from '../../../utils/test'
import { build } from '../../build/build'

describe('sasjs run', () => {
  let target: Target

  describe('runSasCode within project', () => {
    beforeEach(async () => {
      const appName = 'cli-tests-run-' + generateTimestamp()
      await createTestApp(__dirname, appName)
      target = await createTestGlobalTarget(
        appName,
        `/Public/app/cli-tests/${appName}`,
        {
          serviceFolders: ['sasjs/testServices'],
          initProgram: '',
          termProgram: '',
          macroVars: {}
        }
      )
      await copy(
        path.join(__dirname, 'testServices'),
        path.join(process.projectDir, 'sasjs', 'testServices')
      )
    })

    afterEach(async () => {
      await removeFromGlobalConfig(target.name)
      await folder(
        new Command(`folder delete ${target.appLoc} -t ${target.name}`)
      ).catch(() => {})
      await removeTestApp(__dirname, target.name)
    })
    it('should throw an error if file type is not *.sas', async () => {
      const file = 'test.sas.txt'
      const error = new Error(`'sasjs run' command supports only *.sas files.`)

      await expect(
        runSasCode(new Command(`run -t ${target.name} ${file}`))
      ).rejects.toEqual(error)
    })

    it(
      'should get the log on successfull execution having relative path',
      async () => {
        const logPart = `1    data;\n2      do x=1 to 100;\n3        output;\n4      end;\n5    run;`

        const result: any = await runSasCode(
          new Command(`run -t ${target.name} sasjs/testServices/logJob.sas`)
        )

        expect(result.log.includes(logPart)).toBeTruthy()
      },

      60 * 1000
    )

    it(
      'should get the log on successfull execution having absolute path',
      async () => {
        const logPart = `1    data;\n2      do x=1 to 100;\n3        output;\n4      end;\n5    run;`

        const result: any = await runSasCode(
          new Command(
            `run -t ${target.name} ${process.projectDir}/sasjs/testServices/logJob.sas`
          )
        )

        expect(result.log.includes(logPart)).toBeTruthy()
      },

      60 * 1000
    )

    it(
      'should get the log on successfull execution having relative path but compile it first',
      async () => {
        const logPartRegex =
          /[0-9]*  data;\n[0-9]*    do x=1 to 100;\n[0-9]*      output;\n[0-9]*    end;\n[0-9]*  run;\n/

        const result: any = await runSasCode(
          new Command(
            `run -t ${target.name} sasjs/testServices/logJob.sas --compile`
          )
        )

        expect(logPartRegex.test(result.log)).toBeTruthy()
      },

      60 * 1000
    )

    it(
      'should get the log on successfull execution having absolute path but compile it first',
      async () => {
        const logPartRegex =
          /[0-9]*  data;\n[0-9]*    do x=1 to 100;\n[0-9]*      output;\n[0-9]*    end;\n[0-9]*  run;\n/

        const result: any = await runSasCode(
          new Command(
            `run -t ${target.name} ${process.projectDir}/sasjs/testServices/logJob.sas --compile`
          )
        )

        expect(logPartRegex.test(result.log)).toBeTruthy()
      },

      60 * 1000
    )
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
      await folder(
        new Command(`folder delete ${target.appLoc} -t ${target.name}`)
      ).catch(() => {})
      await removeTestApp(__dirname, appName)
    })

    it(
      'should get the log having launch code message',
      async () => {
        const logPart = `SASjs Streaming App Created! Check it out here:\n      \n      \n      \n      \n      sas.analytium.co.uk/SASJobExecution?_PROGRAM=${target.appLoc}/services/clickme\n`
        await build(target)
        const result: any = await runSasCode(
          new Command(`run -t ${target.name} sasjsbuild/myviyadeploy.sas`)
        )

        expect(result.log.includes(logPart)).toBeTruthy()
      },

      60 * 1000
    )
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
      target = await createTestGlobalTarget(
        appName,
        `/Public/app/cli-tests/${appName}`,
        {
          serviceFolders: [`${__dirname}/testServices`],
          initProgram: '',
          termProgram: '',
          macroVars: {}
        }
      )
      process.projectDir = ''
      process.currentDir = path.join(__dirname, appName)
      await createFolder(process.currentDir)
    })

    afterEach(async () => {
      await removeFromGlobalConfig(target.name)
      await deleteFolder(process.currentDir)
      await folder(
        new Command(`folder delete ${target.appLoc} -t ${target.name}`)
      ).catch(() => {})
    })

    afterAll(async () => {
      await removeTestApp(homedir, sharedAppName)
      await deleteFolder(path.join(homedir, 'sasjsbuild'))
      await deleteFolder(path.join(homedir, 'sasjsresults'))
    })

    it(
      'should get the log on successfull execution having relative path',
      async () => {
        const logPart = `1    data;\n2      do x=1 to 100;\n3        output;\n4      end;\n5    run;`

        const result: any = await runSasCode(
          new Command(`run -t ${target.name} ../testServices/logJob.sas`)
        )

        expect(result.log.includes(logPart)).toBeTruthy()
      },

      60 * 1000
    )

    it(
      'should get the log on successfull execution having absolute path',
      async () => {
        const logPart = `1    data;\n2      do x=1 to 100;\n3        output;\n4      end;\n5    run;`

        const result: any = await runSasCode(
          new Command(
            `run -t ${target.name} ${__dirname}/testServices/logJob.sas`
          )
        )

        expect(result.log.includes(logPart)).toBeTruthy()
      },

      60 * 1000
    )

    it(
      'should get the log on successfull execution having relative path but compile it first',
      async () => {
        const logPartRegex =
          /[0-9]*  data;\n[0-9]*    do x=1 to 100;\n[0-9]*      output;\n[0-9]*    end;\n[0-9]*  run;\n/

        const result: any = await runSasCode(
          new Command(
            `run -t ${target.name} ../testServices/logJob.sas --compile`
          )
        )

        expect(logPartRegex.test(result.log)).toBeTruthy()
      },

      60 * 1000
    )

    it(
      'should get the log on successfull execution having absolute path but compile it first',
      async () => {
        const logPartRegex =
          /[0-9]*  data;\n[0-9]*    do x=1 to 100;\n[0-9]*      output;\n[0-9]*    end;\n[0-9]*  run;\n/

        const result: any = await runSasCode(
          new Command(
            `run -t ${target.name} ${__dirname}/testServices/logJob.sas --compile`
          )
        )

        expect(logPartRegex.test(result.log)).toBeTruthy()
      },

      60 * 1000
    )
  })

  describe('without global config', () => {
    beforeEach(async () => {
      const appName = `cli-tests-run-${generateTimestamp()}`
      await saveGlobalRcFile('')
      process.projectDir = ''
      process.currentDir = path.join(__dirname, appName)
      await createFolder(process.currentDir)
    })

    afterEach(async () => {
      await deleteFolder(process.currentDir)
    })

    it('should throw an error for no target found', async () => {
      const error = new Error(
        'Target `someTargetName` was not found.\nPlease check the target name and try again, or use `sasjs add` to add a new target.'
      )
      await expect(
        runSasCode(new Command(`run -t someTargetName some-file.sas`))
      ).rejects.toEqual(error)
    })
  })

  describe('sasjs run with SAS9', () => {
    beforeEach(async () => {
      const appName = 'cli-tests-run-sas9-' + generateTimestamp()
      await createTestApp(__dirname, appName)
      target = await createTestGlobalTarget(
        appName,
        `/Public/app/cli-tests/${appName}`,
        {
          serviceFolders: ['sasjs/testServices'],
          initProgram: '',
          termProgram: '',
          macroVars: {}
        },
        ServerType.Sas9
      )
      await copy(
        path.join(__dirname, 'testServices'),
        path.join(process.projectDir, 'sasjs', 'testServices')
      )
    })

    afterEach(async () => {
      await removeFromGlobalConfig(target.name)
      await folder(
        new Command(`folder delete ${target.appLoc} -t ${target.name}`)
      ).catch(() => {})
      await removeTestApp(__dirname, target.name)
    })

    it(
      'should run a file when a relative path is provided',
      async () => {
        const logParts = ['data;', 'do x=1 to 100;', 'output;', 'end;', 'run;']

        const result: any = await runSasCode(
          new Command(`run -t ${target.name} sasjs/testServices/logJob.sas`)
        )

        logParts.forEach((logPart) => {
          expect(result.log.includes(logPart)).toBeTruthy()
        })
      },

      60 * 1000
    )

    it(
      'should run a file when an absolute path is provided',
      async () => {
        const logParts = ['data;', 'do x=1 to 100;', 'output;', 'end;', 'run;']

        const result: any = await runSasCode(
          new Command(
            `run -t ${target.name} ${process.projectDir}/sasjs/testServices/logJob.sas`
          )
        )

        logParts.forEach((logPart) => {
          expect(result.log.includes(logPart)).toBeTruthy()
        })
      },

      60 * 1000
    )
  })
})
