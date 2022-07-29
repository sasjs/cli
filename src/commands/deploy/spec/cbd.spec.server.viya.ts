import { fileExists, copy, readFile, StreamConfig } from '@sasjs/utils'
import path from 'path'
import { Target, generateTimestamp } from '@sasjs/utils'
import * as configUtils from '../../../utils/config'
import * as getDeployScriptsModule from '../internal/getDeployScripts'
import {
  createTestApp,
  createTestMinimalApp,
  removeTestApp,
  removeTestServerFolder
} from '../../../utils/test'
import { build } from '../../build/build'
import { deploy } from '../deploy'
import { generateTarget, copyJobsAndServices } from './utils'

describe('sasjs cbd with Viya', () => {
  describe('sasjs cbd with global config', () => {
    let target: Target

    beforeEach(async () => {
      target = generateTarget(false)

      await createTestMinimalApp(__dirname, target.name)
      await copyJobsAndServices(target.name)
    })

    afterEach(async () => {
      await removeTestServerFolder(target.appLoc, target)

      await removeTestApp(__dirname, target.name)
    })

    it('should compile, build and deploy', async () => {
      const servicePath = path.join(
        __dirname,
        target.name,
        'sasjsbuild/services/testJob/job.sas'
      )
      const jobPath = path.join(
        __dirname,
        target.name,
        'sasjsbuild/jobs/testJob/job.sas'
      )
      const buildJsonPath = path.join(
        __dirname,
        target.name,
        `sasjsbuild/${target.name}.json`
      )
      await expect(build(target)).toResolve()
      await expect(deploy(target, false)).toResolve()
      await expect(fileExists(servicePath)).resolves.toEqual(true)
      await expect(fileExists(jobPath)).resolves.toEqual(true)
      /**
       * test to ensure that jobs do not have web service pre code
       */
      const jobContent = await readFile(jobPath)
      expect(jobContent).not.toEqual('')
      expect(/^\* Job Variables start;*/.test(jobContent)).toEqual(true)
      expect(jobContent.includes(`* JobInit start;`)).toEqual(true)
      expect(jobContent.includes(`* JobTerm start;`)).toEqual(true)
      /**
       * test to ensure that services are deployed in a subfolder of a folder called services
       *  */
      const jsonContent = JSON.parse(await readFile(buildJsonPath))
      expect(
        !!jsonContent.members.find((x: any) => x.name === 'services')
      ).toEqual(true)
      /**
       * test to ensure that web services do have pre code
       */
      const serviceContent = await readFile(servicePath)
      expect(serviceContent).not.toEqual('')
      expect(/^\* Service Variables start;*/.test(serviceContent)).toEqual(
        false
      )
      expect(serviceContent.includes(`* ServiceInit start;`)).toEqual(true)
      expect(serviceContent.includes(`* ServiceTerm start;`)).toEqual(true)
    })
  })

  describe('sasjs cbd with local config', () => {
    let target: Target
    let appName: string

    beforeEach(async () => {
      appName = `cli-tests-cbd-local-${generateTimestamp()}`
      await createTestApp(__dirname, appName)
      target = generateTarget(true)
      await copyJobsAndServices(appName)
      await copy(
        path.join(__dirname, 'testScript', 'copyscript.sh'),
        path.join(process.projectDir, 'sasjs', 'build', 'copyscript.sh')
      )
    })

    afterEach(async () => {
      await removeTestServerFolder(target.appLoc, target)

      await removeTestApp(__dirname, appName)

      jest.resetAllMocks()
    })

    it('should deploy service pack when deployServicePack is true', async () => {
      await expect(build(target)).toResolve()
      await expect(deploy(target, true)).toResolve()
    })

    it('should deploy using deployScripts when deployServicePack is false', async () => {
      const customTarget = new Target({
        ...target.toJson(),
        deployConfig: {
          deployServicePack: false,
          deployScripts: ['sasjs/build/copyscript.sh']
        }
      })

      await expect(build(customTarget)).toResolve()
      await expect(deploy(customTarget, true)).toResolve()
    })

    it('should error when deployServicePack is false and no deployScripts have been specified', async () => {
      const customTarget = new Target({
        ...target.toJson(),
        deployConfig: {
          deployServicePack: false,
          deployScripts: []
        }
      })
      jest
        .spyOn(getDeployScriptsModule, 'getDeployScripts')
        .mockImplementation(() => Promise.resolve([]))

      await build(customTarget)
      await expect(deploy(customTarget, true)).rejects.toEqual(
        new Error(
          `Deployment failed.\nPlease either enable the 'deployServicePack' option or add deployment script paths to 'deployScripts' in your target's 'deployConfig'.`
        )
      )
    })

    it(`should error when an access token is not provided`, async () => {
      jest.spyOn(configUtils, 'getAccessToken').mockImplementation(() => {
        return Promise.reject('Token error')
      })

      await build(target)
      await expect(deploy(target, true)).rejects.toEqual(
        new Error(
          `Deployment failed. Request is not authenticated.\nPlease add the following variables to your .env.${target.name} file:\nCLIENT, SECRET, ACCESS_TOKEN, REFRESH_TOKEN`
        )
      )
    })
  })

  describe('sasjs cbd having stream app', () => {
    let target: Target
    let appName: string

    const streamConfig: StreamConfig = {
      assetPaths: [],
      streamWeb: true,
      streamWebFolder: 'webv',
      webSourcePath: 'src',
      streamServiceName: 'clickme'
    }

    beforeEach(async () => {
      appName = `cli-tests-cbd-local-stream-${generateTimestamp()}`
      await createTestMinimalApp(__dirname, appName)
      target = generateTarget(true)
    })

    afterEach(async () => {
      await removeTestServerFolder(target.appLoc, target)

      await removeTestApp(__dirname, appName)

      jest.resetAllMocks()
    })

    it(`should deploy compile and build with streamConfig`, async () => {
      const appLoc = `/Public/app/cli-tests/${target.name}`
      const appLocWithSpaces = `${appLoc}/with some/space s`

      const customTarget = new Target({
        ...target.toJson(),
        appLoc: appLocWithSpaces,
        streamConfig,
        jobConfig: undefined,
        serviceConfig: undefined,
        deployConfig: {
          deployServicePack: false,
          deployScripts: [`sasjsbuild/${target.name}.sas`]
        }
      })

      await expect(build(customTarget)).toResolve()
      await expect(deploy(customTarget, true)).toResolve()

      const logFileContent = await readFile(
        path.join(__dirname, appName, 'sasjsbuild', `${target.name}.log`)
      )

      const appLocTransformed = '/with%20some/space%20s'
      const streamingApplink = `${target.serverUrl.replace(
        'https://',
        ''
      )}/SASJobExecution?_FILE=${appLoc}${appLocTransformed}/services/${
        streamConfig.streamServiceName
      }.html&_debug=2`

      expect(logFileContent.replace(/\s/g, '')).toEqual(
        expect.stringContaining(streamingApplink)
      )
    })
  })
})
