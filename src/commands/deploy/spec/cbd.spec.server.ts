import {
  fileExists,
  createFile,
  copy,
  readFile,
  StreamConfig
} from '@sasjs/utils'
import dotenv from 'dotenv'
import path from 'path'
import { compileBuildDeployServices } from '../../../main'
import { folder } from '../../folder/index'
import { ServerType, Target, TargetJson, generateTimestamp } from '@sasjs/utils'
import {
  removeFromGlobalConfig,
  saveToGlobalConfig
} from '../../../utils/config'
import * as configUtils from '../../../utils/config'
import * as displayResultModule from '../../../utils/displayResult'
import * as getDeployScriptsModule from '../internal/getDeployScripts'
import {
  createTestApp,
  createTestMinimalApp,
  removeTestApp
} from '../../../utils/test'
import { Command } from '../../../utils/command'
import { setConstants } from '../../../utils'

describe('sasjs cbd with global config', () => {
  let target: Target

  beforeEach(async () => {
    target = await createGlobalTarget()
    await createTestMinimalApp(__dirname, target.name)
    await copyJobsAndServices(target.name)
  })

  afterEach(async () => {
    await removeFromGlobalConfig(target.name)

    await folder(
      new Command(`folder delete ${target.appLoc} -t ${target.name}`)
    ).catch(() => {})

    await removeTestApp(__dirname, target.name)
  })

  it('should compile, build and deploy', async () => {
    const command = new Command(`cbd -t ${target.name} -f`.split(' '))
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
    await expect(compileBuildDeployServices(command)).toResolve()
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
    expect(/^\* Service Variables start;*/.test(serviceContent)).toEqual(false)
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
    target = await createLocalTarget()
    await copyJobsAndServices(appName)
    await copy(
      path.join(__dirname, 'testScript', 'copyscript.sh'),
      path.join(process.projectDir, 'sasjs', 'build', 'copyscript.sh')
    )
  })

  afterEach(async () => {
    await folder(
      new Command(`folder delete ${target.appLoc} -t ${target.name}`)
    ).catch(() => {})

    await removeTestApp(__dirname, appName)

    jest.resetAllMocks()
  })

  it('should deploy service pack when deployServicePack is true', async () => {
    const command = new Command(`cbd -t ${target.name} -f`.split(' '))
    await expect(compileBuildDeployServices(command)).toResolve()
  })

  it('should deploy using deployScripts when deployServicePack is false', async () => {
    await updateLocalTarget(target.name, {
      deployConfig: {
        deployServicePack: false,
        deployScripts: ['sasjs/build/copyscript.sh']
      }
    })
    const command = new Command(`cbd -t ${target.name} -f`.split(' '))
    await expect(compileBuildDeployServices(command)).toResolve()
  })

  it('should error when deployServicePack is false and no deployScripts have been specified', async () => {
    await updateLocalTarget(target.name, {
      deployConfig: {
        deployServicePack: false,
        deployScripts: []
      }
    })
    jest
      .spyOn(getDeployScriptsModule, 'getDeployScripts')
      .mockImplementation(() => Promise.resolve([]))
    jest.spyOn(displayResultModule, 'displayError')

    const command = new Command(`cbd -t ${target.name} -f`.split(' '))
    await compileBuildDeployServices(command)

    expect(displayResultModule.displayError).toHaveBeenCalledWith(
      new Error(
        `Deployment failed.\nPlease either enable the 'deployServicePack' option or add deployment script paths to 'deployScripts' in your target's 'deployConfig'.`
      ),
      'An error has occurred when deploying services.'
    )
  })

  it(`should error when an access token is not provided`, async () => {
    jest.spyOn(configUtils, 'getAuthConfig').mockImplementation(() => {
      return Promise.reject('Token error')
    })
    jest.spyOn(displayResultModule, 'displayError')

    const command = new Command(`cbd -t ${target.name} -f`.split(' '))
    await compileBuildDeployServices(command)

    expect(displayResultModule.displayError).toHaveBeenCalledWith(
      new Error(
        `Deployment failed. Request is not authenticated.\nPlease add the following variables to your .env.${target.name} file:\nCLIENT, SECRET, ACCESS_TOKEN, REFRESH_TOKEN`
      ),
      'An error has occurred when deploying services.'
    )
  })
})

const streamConfig: StreamConfig = {
  assetPaths: [],
  streamWeb: true,
  streamWebFolder: 'webv',
  webSourcePath: 'src',
  streamServiceName: 'clickme'
}

describe('sasjs cbd having stream app', () => {
  let target: Target
  let appName: string

  beforeEach(async () => {
    appName = `cli-tests-cbd-local-stream-${generateTimestamp()}`
    await createTestMinimalApp(__dirname, appName)
    target = await createLocalTarget()
  })

  afterEach(async () => {
    await folder(
      new Command(`folder delete ${target.appLoc} -t ${target.name}`)
    ).catch(() => {})

    await removeTestApp(__dirname, appName)

    jest.resetAllMocks()
  })

  it(`should deploy compile and build with streamConfig`, async () => {
    const appLoc = `/Public/app/cli-tests/${target.name}`
    const appLocWithSpaces = `${appLoc}/with some/space s`
    await updateLocalTarget(target.name, {
      appLoc: appLocWithSpaces,
      streamConfig,
      jobConfig: undefined,
      serviceConfig: undefined,
      deployConfig: {
        deployServicePack: false,
        deployScripts: [`sasjsbuild/${target.name}.sas`]
      }
    })

    const command = new Command(`cbd -t ${target.name} -f`.split(' '))
    await expect(compileBuildDeployServices(command)).toResolve()

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

    await updateLocalTarget(target.name, { appLoc })
  })
})

const createGlobalTarget = async (serverType = ServerType.SasViya) => {
  dotenv.config()
  const timestamp = generateTimestamp()
  const targetName = `cli-tests-cbd-${timestamp}`
  await setConstants()
  const target = new Target({
    name: targetName,
    serverType,
    serverUrl: (serverType === ServerType.SasViya
      ? process.env.VIYA_SERVER_URL
      : process.env.SAS9_SERVER_URL) as string,
    appLoc: `/Public/app/cli-tests/${targetName}`,
    contextName: process.sasjsConstants.contextName,
    serviceConfig: {
      serviceFolders: ['sasjs/testServices', 'sasjs/testJob'],
      initProgram: 'sasjs/testServices/serviceinit.sas',
      termProgram: 'sasjs/testServices/serviceterm.sas',
      macroVars: {}
    },
    jobConfig: {
      jobFolders: ['sasjs/testJob'],
      initProgram: 'sasjs/testServices/serviceinit.sas',
      termProgram: 'sasjs/testServices/serviceterm.sas',
      macroVars: {}
    },
    authConfig: {
      client: process.env.CLIENT as string,
      secret: process.env.SECRET as string,
      access_token: process.env.ACCESS_TOKEN as string,
      refresh_token: process.env.REFRESH_TOKEN as string
    },
    deployConfig: {
      deployServicePack: true,
      deployScripts: []
    }
  })
  await saveToGlobalConfig(target)
  return target
}

const createLocalTarget = async (serverType = ServerType.SasViya) => {
  dotenv.config()
  const timestamp = generateTimestamp()
  const targetName = `cli-tests-cbd-${timestamp}`

  const target = new Target({
    name: targetName,
    serverType,
    serverUrl: (serverType === ServerType.SasViya
      ? process.env.VIYA_SERVER_URL
      : process.env.SAS9_SERVER_URL) as string,
    appLoc: `/Public/app/cli-tests/${targetName}`,
    contextName: process.sasjsConstants.contextName,
    serviceConfig: {
      serviceFolders: ['sasjs/testServices', 'sasjs/testJob', 'sasjs/services'],
      initProgram: 'sasjs/testServices/serviceinit.sas',
      termProgram: 'sasjs/testServices/serviceterm.sas',
      macroVars: {}
    },
    jobConfig: {
      jobFolders: ['sasjs/testJob'],
      initProgram: 'sasjs/testServices/serviceinit.sas',
      termProgram: 'sasjs/testServices/serviceterm.sas',
      macroVars: {}
    },
    deployConfig: {
      deployServicePack: true,
      deployScripts: []
    }
  })

  const configContent = await readFile(
    path.join(process.projectDir, 'sasjs', 'sasjsconfig.json')
  )

  const configJSON = JSON.parse(configContent)
  configJSON.targets = [
    {
      ...target.toJson(),
      deployConfig: {
        deployScripts: ['sasjs/build/copyscript.sh'],
        deployServicePack: true
      }
    }
  ]

  await createFile(
    path.join(process.projectDir, 'sasjs', 'sasjsconfig.json'),
    JSON.stringify(configJSON, null, 2)
  )

  return target
}

const updateLocalTarget = async (targetName: string, data: any) => {
  dotenv.config()

  const configContent = await readFile(
    path.join(process.projectDir, 'sasjs', 'sasjsconfig.json')
  )

  const configJSON = JSON.parse(configContent)
  const target = configJSON?.targets?.find(
    (t: TargetJson) => t.name === targetName
  )
  configJSON.targets = [
    {
      ...target,
      ...data
    }
  ]

  await createFile(
    path.join(process.projectDir, 'sasjs', 'sasjsconfig.json'),
    JSON.stringify(configJSON, null, 2)
  )
}

const copyJobsAndServices = async (appName: string) => {
  await copy(
    path.join(__dirname, 'testJob'),
    path.join(__dirname, appName, 'sasjs', 'testJob')
  )
  await copy(
    path.join(__dirname, 'testServices'),
    path.join(__dirname, appName, 'sasjs', 'testServices')
  )
}
