import { ServerType, Target, TargetJson, generateTimestamp } from '@sasjs/utils'
import { setConstants } from '../../../utils'
import { saveToGlobalConfig } from '../../../utils/config'
import dotenv from 'dotenv'
import { createFile, copy, readFile } from '@sasjs/utils'
import path from 'path'
import { contextName } from '../../../utils'

export const createGlobalTarget = async (serverType = ServerType.SasViya) => {
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

export const createLocalTarget = async (serverType = ServerType.SasViya) => {
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

export const updateLocalTarget = async (targetName: string, data: any) => {
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

export const copyJobsAndServices = async (appName: string) => {
  await copy(
    path.join(__dirname, 'testJob'),
    path.join(__dirname, appName, 'sasjs', 'testJob')
  )
  await copy(
    path.join(__dirname, 'testServices'),
    path.join(__dirname, appName, 'sasjs', 'testServices')
  )
}

export const generateTarget = (isLocal: boolean) => {
  dotenv.config()
  const timestamp = generateTimestamp()
  const targetName = `cli-tests-cbd-${timestamp}`

  const authConfig = isLocal
    ? undefined
    : {
        client: process.env.CLIENT as string,
        secret: process.env.SECRET as string,
        access_token: process.env.ACCESS_TOKEN as string,
        refresh_token: process.env.REFRESH_TOKEN as string
      }

  return new Target({
    name: targetName,
    serverType: ServerType.SasViya,
    serverUrl: process.env.VIYA_SERVER_URL as string,
    appLoc: `/Public/app/cli-tests/${targetName}`,
    contextName,
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
    authConfig,
    deployConfig: {
      deployServicePack: true,
      deployScripts: ['']
    }
  })
}
