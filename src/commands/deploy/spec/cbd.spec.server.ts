import {
  deleteFolder,
  fileExists,
  createFile,
  copy,
  readFile
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

describe('sasjs cbd with global config', () => {
  let target: Target

  beforeEach(async () => {
    target = await createGlobalTarget()
    await createTestMinimalApp(__dirname, target.name)
    await copyJobsAndServices(target.name)
  })

  afterEach(async (done) => {
    await removeFromGlobalConfig(target.name)

    await folder(
      new Command(`folder delete ${target.appLoc} -t ${target.name}`)
    ).catch(() => {})

    await removeTestApp(__dirname, target.name)
    done()
  })

  it('should compile, build and deploy', async (done) => {
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
    expect(/^\* Dependencies start;*/.test(jobContent)).toEqual(true)
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
    done()
  })
})

describe('sasjs cbd with local config', () => {
  let target: Target
  let appName: string

  beforeEach(async (done) => {
    appName = `cli-tests-cbd-local-${generateTimestamp()}`
    await createTestApp(__dirname, appName)
    target = await createLocalTarget()
    await copyJobsAndServices(appName)
    await copy(
      path.join(__dirname, 'testScript', 'copyscript.sh'),
      path.join(process.projectDir, 'sasjs', 'build', 'copyscript.sh')
    )
    done()
  })

  afterEach(async (done) => {
    await folder(
      new Command(`folder delete ${target.appLoc} -t ${target.name}`)
    ).catch(() => {})

    await removeTestApp(__dirname, appName)

    jest.resetAllMocks()

    done()
  })

  it('should deploy service pack when deployServicePack is true', async (done) => {
    const command = new Command(`cbd -t ${target.name} -f`.split(' '))
    await expect(compileBuildDeployServices(command)).toResolve()

    done()
  })

  it('should deploy using deployScripts when deployServicePack is false', async (done) => {
    await updateLocalTarget(target.name, {
      deployConfig: {
        deployServicePack: false,
        deployScripts: ['sasjs/build/copyscript.sh']
      }
    })
    const command = new Command(`cbd -t ${target.name} -f`.split(' '))
    await expect(compileBuildDeployServices(command)).toResolve()

    done()
  })

  it('should error when deployServicePack is false and no deployScripts have been specified', async (done) => {
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

    done()
  })

  it(`should error when an access token is not provided`, async (done) => {
    jest.spyOn(configUtils, 'getAccessToken').mockImplementation(() => {
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

    done()
  })
})

const createGlobalTarget = async () => {
  dotenv.config()
  const timestamp = generateTimestamp()
  const targetName = `cli-tests-cbd-${timestamp}`

  const serverType: ServerType =
    process.env.SERVER_TYPE === ServerType.SasViya
      ? ServerType.SasViya
      : ServerType.Sas9
  const target = new Target({
    name: targetName,
    serverType,
    serverUrl: process.env.SERVER_URL as string,
    appLoc: `/Public/app/cli-tests/${targetName}`,
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

const createLocalTarget = async () => {
  dotenv.config()
  const timestamp = generateTimestamp()
  const targetName = `cli-tests-cbd-${timestamp}`

  const serverType: ServerType =
    process.env.SERVER_TYPE === ServerType.SasViya
      ? ServerType.SasViya
      : ServerType.Sas9
  const target = new Target({
    name: targetName,
    serverType,
    serverUrl: process.env.SERVER_URL as string,
    appLoc: `/Public/app/cli-tests/${targetName}`,
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
