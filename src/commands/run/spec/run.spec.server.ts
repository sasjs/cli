import path from 'path'
import { folder, runSasCode } from '../..'
import { copy, deleteFile } from '../../../utils/file'
import { generateTimestamp } from '../../../utils/utils'
import { Target } from '@sasjs/utils/types'
import { Command } from '../../../utils/command'
import { removeFromGlobalConfig } from '../../../utils/config'
import {
  createTestApp,
  createTestGlobalTarget,
  removeTestApp
} from '../../../utils/test'

describe('sasjs run', () => {
  let target: Target

  beforeEach(async (done) => {
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

    done()
  })

  afterEach(async (done) => {
    await removeFromGlobalConfig(target.name)
    await folder(
      new Command(`folder delete ${target.appLoc} -t ${target.name}`)
    ).catch(() => {})
    await removeTestApp(__dirname, target.name)
    await deleteFile(path.join(process.cwd(), 'sasjs-run*.log'))
    done()
  })

  describe('runSasCode', () => {
    it('should throw an error if file type is not *.sas', async () => {
      const file = 'test.sas.txt'
      const error = new Error(`'sasjs run' command supports only *.sas files.`)

      await expect(
        runSasCode(new Command(`run -t ${target.name} ${file}`))
      ).rejects.toEqual(error)
    })

    it(
      'should get the log on successfull execution',
      async () => {
        const logPart = `1    data;\n2      do x=1 to 100;\n3        output;\n4      end;\n5    run;`

        let result: any = await runSasCode(
          new Command(
            `run -t ${target.name} src/commands/run/spec/testServices/logJob.sas`
          )
        )

        expect(result.log.includes(logPart)).toBeTruthy()
      },

      60 * 1000
    )
  })
})
