import { create } from '../sasjs-create'
import { getAndValidateField } from '../utils/input-utils'
import chalk from 'chalk'
import path from 'path'
import SASjs from '@sasjs/adapter/node'
import validUrl from 'valid-url'
import {
  getGlobalRcFile,
  saveGlobalRcFile,
  getConfiguration
} from '../utils/config-utils'
import { createFile } from '../utils/file-utils'
import { getNewAccessToken } from '../utils/auth-utils'

export async function addTarget() {
  const scope = await getAndValidateScope()
  const serverType = await getAndValidateServerType()
  const name = await getAndValidateTargetName(scope, serverType)

  const appLoc = await getAndValidateAppLoc(name)

  const serverUrl = await getAndValidateServerUrl()

  let buildTarget = {
    name,
    serverType: serverType === 1 ? 'SASVIYA' : 'SAS9',
    serverUrl
  }

  if (serverType === 2) {
    const sas9FieldValues = await getAndValidateSas9Fields()
    buildTarget = {
      ...buildTarget,
      tgtBuildVars: sas9FieldValues,
      tgtDeployVars: sas9FieldValues
    }
  } else {
    const {
      client,
      secret,
      contextName,
      authInfo
    } = await getAndValidateSasViyaFields(serverUrl)

    buildTarget = {
      ...buildTarget,
      appLoc,
      tgtBuildVars: { client, secret, contextName },
      tgtDeployVars: { client, secret, contextName },
      authInfo: authInfo,
      deployServicePack: true,
      tgtDeployScripts: []
    }
  }

  if (scope === 1) {
    await saveToLocalConfig(buildTarget)
  } else if (scope === 2) {
    await saveToGlobalConfig(buildTarget)
  }
}

async function getLocalConfig() {
  const buildSourceFolder = require('../constants').buildSourceFolder
  const config = await getConfiguration(
    path.join(buildSourceFolder, 'sasjsconfig.json')
  )
  if (!config) await create('.', 'sasonly')
  return config
}

async function saveToLocalConfig(buildTarget) {
  const buildSourceFolder = require('../constants').buildSourceFolder
  let config = await getLocalConfig()
  if (config) {
    if (config.targets && config.targets.length) {
      config.targets.push(buildTarget)
    } else {
      config.targets = [buildTarget]
    }
  } else {
    config = { targets: [buildTarget] }
  }

  const configPath = path.join(buildSourceFolder, 'sasjsconfig.json')

  await createFile(configPath, JSON.stringify(config, null, 2))

  console.log(chalk.greenBright(`Config saved to '${configPath}'.`))
}

async function saveToGlobalConfig(buildTarget) {
  let globalConfig = await getGlobalRcFile()
  if (globalConfig) {
    if (globalConfig.targets && globalConfig.targets.length) {
      globalConfig.targets.push(buildTarget)
    } else {
      globalConfig.targets = [buildTarget]
    }
  } else {
    globalConfig = { targets: [buildTarget] }
  }
  await saveGlobalRcFile(JSON.stringify(globalConfig, null, 2))
}

async function getAndValidateScope() {
  const scopeField = {
    name: 'scope',
    type: 'integer',
    description: chalk.cyanBright(
      `${chalk.greenBright(
        'Please pick a scope for the new target:'
      )}\n1. Local project config file\n2. Global config file`
    ),
    default: 1
  }

  const validator = (value) => {
    return value === 1 || value === 2
  }

  const message = `Invalid input. Please choose option 1 or 2.`

  return await getAndValidateField(scopeField, validator, message)
}

async function getAndValidateServerType() {
  const serverTypeField = {
    name: 'serverType',
    type: 'integer',
    description: chalk.cyanBright(
      `${chalk.greenBright(
        'Please pick a server type:'
      )}\n1. SAS Viya\n2. SAS 9`
    ),
    default: 1
  }

  const validator = (value) => {
    return value === 1 || value === 2
  }

  const message = `Invalid input. Please choose option 1 or 2.`

  return await getAndValidateField(serverTypeField, validator, message)
}

async function getAndValidateServerUrl() {
  const serverUrlField = {
    name: 'serverUrl',
    description: chalk.cyanBright(
      `${chalk.greenBright(
        'Please enter a target server URL (including port, if relevant):'
      )}`
    )
  }

  const validator = validUrl.isUri

  const message = 'Invalid input. Please enter a valid URI.'

  return await getAndValidateField(serverUrlField, validator, message)
}

async function getAndValidateTargetName(targetScope, serverType) {
  const validator = async (value, scope) => {
    let config
    if (scope === 1) {
      config = await getLocalConfig()
    } else {
      config = await getGlobalRcFile()
    }

    let existingTargetNames = []
    if (config && config.targets) {
      existingTargetNames = config.targets.map((t) => t.name)
    }

    return !existingTargetNames.includes(value)
  }

  const defaultName = serverType === 1 ? 'viya' : 'sas9'
  const isDefaultNameValid = await validator(defaultName, targetScope)

  const targetNameField = {
    name: 'name',
    description: chalk.cyanBright(
      `${chalk.greenBright('Please enter a target name:')}`
    ),
    default: isDefaultNameValid ? defaultName : ''
  }

  const message =
    'A target with that name already exists!\nPlease try again with a different target name.'

  return await getAndValidateField(
    targetNameField,
    validator,
    message,
    targetScope
  )
}

async function getAndValidateSas9Fields() {
  const serverNameField = {
    name: 'serverName',
    description: chalk.cyanBright(
      `${chalk.greenBright(
        'Please enter a server name' + chalk.cyanBright('(default is SASApp):')
      )}`
    )
  }

  const repositoryNameField = {
    name: 'repositoryName',
    description: chalk.cyanBright(
      `${chalk.greenBright(
        'Please enter a repository name' +
          chalk.cyanBright('(default is Foundation):')
      )}`
    )
  }

  let serverName = await getAndValidateField(serverNameField, () => true, '')
  let repositoryName = await getAndValidateField(
    repositoryNameField,
    () => true,
    ''
  )
  serverName = serverName || 'SASApp'
  repositoryName = repositoryName || 'Foundation'
  return { serverName, repositoryName }
}

async function getAndValidateSasViyaFields(serverUrl) {
  const clientField = {
    name: 'client',
    description: chalk.cyanBright(
      `${chalk.greenBright('Please enter your SAS Viya app client ID: ')}`
    )
  }
  const secretField = {
    name: 'secret',
    description: chalk.cyanBright(
      `${chalk.greenBright('Please enter your SAS Viya app client secret: ')}`
    )
  }

  const contextNameField = {
    name: 'contextName',
    type: 'integer',
    description: chalk.cyanBright(
      `${chalk.greenBright(
        'Please enter your SAS Viya execution context number: '
      )}`
    )
  }
  const nonEmptyValidator = (value) => !!value
  const message = 'This value can not be empty. Please enter a value'
  const client = await getAndValidateField(
    clientField,
    nonEmptyValidator,
    message
  )
  const secret = await getAndValidateField(
    secretField,
    nonEmptyValidator,
    message
  )

  const sasjs = new SASjs({
    serverUrl: serverUrl,
    serverType: 'SASVIYA',
    debug: true
  })

  const authResponse = await getNewAccessToken(sasjs, client, secret, {
    serverUrl
  })

  const contexts = await sasjs.getAllContexts(authResponse.access_token)
  console.log(
    chalk.cyanBright(
      'Here are all the available execution contexts on this server:\n'
    )
  )
  console.log(
    chalk.cyanBright(
      `${contexts
        .map((c, i) => chalk.yellowBright(`${i + 1}. `) + c.name)
        .join('\n')}`
    )
  )

  const contextNumber =
    (await getAndValidateField(contextNameField, nonEmptyValidator, message)) -
    1
  const contextName = contexts[contextNumber].name

  return { client, secret, contextName, authInfo: authResponse }
}

async function getAndValidateAppLoc(target) {
  const appLoc = {
    name: 'app location',
    type: 'string',
    description: chalk.cyanBright(
      `${chalk.greenBright('Please provide an app location:')}`
    ),
    default: `/Public/app/${target}`
  }

  const validator = (value) => value !== ''
  const message = 'Invalid input.'

  return await getAndValidateField(appLoc, validator, message)
}
