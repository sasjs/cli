import chalk from 'chalk'
import { getUserInput } from '../utils/input-utils'
import { fileExists, readFile } from '../utils/file-utils'
import { getBuildTargets } from '../utils/config-utils'
import SASjs from '@sasjs/adapter/node'

export async function processContext(command) {
  const targetName = await getAndValidateTargetName()
  const target = await getTarget(targetName)
  const configPath = await getAndValidateConfigPath()
  const config = await readFile(configPath)

  let validationMap = {}
  let parsedConfig = {}

  switch (command) {
    case 'create':
      validationMap = {
        name: '',
        launchName: '',
        sharedAccountId: '',
        autoExecLines: [],
        authorizedUsers: []
      }

      validateConfig(config, validationMap)

      parsedConfig = JSON.parse(config)

      create(parsedConfig, target)

      break
    case 'edit':
      validationMap = {
        contextId: '',
        updatedContext: {}
      }

      validateConfig(config, validationMap)

      parsedConfig = JSON.parse(config)

      edit(parsedConfig, target)

      break
    case 'delete':
      validationMap = {
        contextId: ''
      }

      validateConfig(config, validationMap)

      parsedConfig = JSON.parse(config)

      remove(parsedConfig, target)

      break
    default:
      console.log(chalk.redBright('Not supported context command.'))

      break
  }
}

async function getTarget(targetName) {
  const { buildSourceFolder } = require('../constants')
  const targets = await getBuildTargets(buildSourceFolder)
  const target = targets.find((t) => t.name === targetName)

  if (!target)
    throw new Error(
      `Target with the name '${targetName}' was not found in sasjsconfig.json`
    )

  return target
}

async function getAndValidateConfigPath() {
  const nameField = {
    name: 'configPath',
    type: 'string',
    description: chalk.cyanBright(
      `${chalk.greenBright(
        'Please provide path to context config file (eg. ./contextConfig.json).'
      )}`
    )
  }

  const validator = async (value) => {
    if (!value) return false

    const isJsonFile = /\.json$/i.test(value)

    if (!isJsonFile) return false

    return await fileExists(value)
  }

  const message = `Invalid input. Couldn't find context config file at provided location.`

  return await getAndValidateField(nameField, validator, message)
}

function validateConfig(config, configKeys) {
  const validationErrorType = 'validation'

  try {
    const parsedConfig = JSON.parse(config)
    const missedKeys = []

    for (const requiredKey of Object.keys(configKeys)) {
      if (!parsedConfig.hasOwnProperty(requiredKey)) {
        missedKeys.push(requiredKey)
      } else if (
        typeof parsedConfig[requiredKey] !== typeof configKeys[requiredKey]
      ) {
        missedKeys.push(requiredKey)
      } else if (
        Array.isArray(parsedConfig[requiredKey]) !==
        Array.isArray(configKeys[requiredKey])
      ) {
        missedKeys.push(requiredKey)
      }
    }

    if (missedKeys.length) {
      const error = {
        type: validationErrorType,
        message: `Context config file doesn't have all required keys or value is not valid. Please check:\n${missedKeys.join(
          '\n'
        )}`
      }

      throw error
    }
  } catch (err) {
    if (err.type === validationErrorType) throw new Error(err.message)

    throw new Error('Context config file is not a valid JSON file.')
  }
}

async function getAndValidateTargetName() {
  const nameField = {
    name: 'targetName',
    type: 'string',
    description: chalk.cyanBright(
      `${chalk.greenBright('Please provide target name')}`
    )
  }

  const validator = (value) => value !== ''

  const message = 'Invalid input. Target name should be not empty string.'

  return await getAndValidateField(nameField, validator, message)
}

async function create(config, target) {
  const sasjs = new SASjs({
    serverUrl: target.serverUrl,
    serverType: target.serverType
  })

  const accessToken = target.authInfo.access_token
  const {
    name,
    launchName,
    sharedAccountId,
    autoExecLines,
    authorizedUsers
  } = config

  const createdContext = await sasjs
    .createContext(
      name,
      launchName,
      sharedAccountId,
      autoExecLines,
      authorizedUsers,
      accessToken
    )
    .catch((err) => {
      if (err.hasOwnProperty('body')) {
        const body = JSON.parse(err.body)
        const message = body.message || ''
        const details = body.details || ''

        console.log(
          chalk.redBright(
            'An error has occurred when processing context.',
            `${message}${details ? '\n' + details : ''}`
          )
        )
      } else {
        console.log(
          chalk.redBright('An error has occurred when processing context.', err)
        )
      }
    })

  if (createdContext) {
    console.log(
      chalk.greenBright.bold.italic(
        `Context '${name}' with id '${createdContext.id}' successfully created !`
      )
    )
  }
}

async function edit(config, target) {
  const sasjs = new SASjs({
    serverUrl: target.serverUrl,
    serverType: target.serverType
  })

  const accessToken = target.authInfo.access_token
  const { contextId, updatedContext } = config

  const editedContext = await sasjs
    .editContext(contextId, updatedContext, accessToken)
    .catch((err) => {
      if (err.hasOwnProperty('body')) {
        const body = JSON.parse(err.body)
        const message = body.message || ''
        const details = body.details || ''

        console.log(
          chalk.redBright(
            'An error has occurred when processing context.',
            `${message}${details ? '\n' + details : ''}`
          )
        )
      } else {
        console.log(
          chalk.redBright('An error has occurred when processing context.', err)
        )
      }
    })

  if (editedContext) {
    const editedContextName = editedContext.result.name || ''

    console.log(
      chalk.greenBright.bold.italic(
        `Context '${editedContextName}' successfully updated!`
      )
    )
  }
}

async function remove(config, target) {
  const sasjs = new SASjs({
    serverUrl: target.serverUrl,
    serverType: target.serverType
  })

  const accessToken = target.authInfo.access_token
  const { contextId } = config

  const deletedContext = await sasjs
    .deleteContext(contextId, accessToken)
    .catch((err) => {
      if (err.hasOwnProperty('body')) {
        const body = JSON.parse(err.body)
        const message = body.message || ''
        const details = body.details || ''

        console.log(
          chalk.redBright(
            'An error has occurred when processing context.',
            `${message}${details ? '\n' + details : ''}`
          )
        )
      } else {
        console.log(
          chalk.redBright('An error has occurred when processing context.', err)
        )
      }
    })

  if (deletedContext) {
    console.log(
      chalk.greenBright.bold.italic(
        `Context with id '${contextId}' has been deleted!`
      )
    )
  }
}

async function getAndValidateField(field, validator, message) {
  const input = await getUserInput([field])
  const isValid = await validator(input[field.name])

  if (!isValid) {
    console.log(chalk.redBright.bold(message))

    return await getAndValidateField(field, validator, message)
  }

  return input[field.name]
}
