import path from 'path'
import { buildServices, compileServices } from '../../../main'
import { Command } from '../../../utils/command'
import {
  createTestApp,
  createTestMinimalApp,
  removeTestApp,
  updateTarget
} from '../../../utils/test'
import {
  Logger,
  LogLevel,
  generateTimestamp,
  StreamConfig,
  readFile
} from '@sasjs/utils'

const streamConfig: StreamConfig = {
  assetPaths: [],
  streamWeb: true,
  streamWebFolder: 'webv',
  webSourcePath: 'src',
  streamServiceName: 'clickme'
}

describe('sasjs build', () => {
  let appName: string

  beforeAll(() => {
    process.logger = new Logger(LogLevel.Off)
  })

  afterEach(async () => {
    await removeTestApp(__dirname, appName)
  })

  it(
    `should build with minimal template`,
    async () => {
      appName = `test-app-build-minimal-${generateTimestamp()}`
      await createTestApp(__dirname, appName)

      await expect(buildServices(new Command(`build`))).toResolve()
    },
    2 * 60 * 1000
  )

  it(
    `should compile and build(skipping compile)`,
    async () => {
      appName = `test-app-build-${generateTimestamp()}`

      await createTestApp(__dirname, appName)

      await compileServices(new Command(`compile`))
      await expect(buildServices(new Command(`build`))).toResolve()
    },
    2 * 60 * 1000
  )

  it(
    `should compile and build with streamConfig`,
    async () => {
      appName = `test-app-build-${generateTimestamp()}`

      await createTestMinimalApp(__dirname, appName)
      const appLoc = '/with some/space s'
      await updateTarget({ appLoc, streamConfig }, 'viya')

      await compileServices(new Command(`compile -t viya`))
      await expect(buildServices(new Command(`build -t viya`))).toResolve()

      const buildFileContent = await readFile(
        path.join(__dirname, appName, 'sasjsbuild', 'myviyadeploy.sas')
      )

      const appLocTransformed = '/with%20some/space%20s'

      expect(buildFileContent).toEqual(
        expect.stringContaining(
          `url=cats(url,"/SASJobExecution?_FILE=${appLocTransformed}/services/");`
        )
      )
      expect(buildFileContent).toEqual(
        expect.stringContaining(
          `putlog "NOTE- " url +(-1) '${streamConfig.streamServiceName}.html&_debug=2' ;`
        )
      )
    },
    2 * 60 * 1000
  )
})
