import chalk from 'chalk'
import { getUserInput } from '../utils/input-utils'
import { fileExists, readFile } from '../utils/file-utils'
import { getBuildTargets } from '../utils/config-utils'
import SASjs from '@sasjs/adapter/node'

export async function processContext(command) {
  const commands = ['create', 'edit', 'delete']

  if (!commands.includes(command)) {
    console.log(chalk.redBright('Not supported context command.'))

    return
  }

  const targetName = await getAndValidateTargetName()
  const target = await getTarget(targetName)
  const configPath = await getAndValidateConfigPath()
  const config = await readFile(configPath)

  let validationMap = {}
  let parsedConfig = {}

  switch (command) {
    case commands[0]:
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
    case commands[1]:
      validationMap = {
        name: '',
        updatedContext: {}
      }

      validateConfig(config, validationMap)

      parsedConfig = JSON.parse(config)

      edit(parsedConfig, target)

      break
    case commands[2]:
      validationMap = {
        name: ''
      }

      validateConfig(config, validationMap)

      parsedConfig = JSON.parse(config)

      remove(parsedConfig, target)

      break
    default:
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

  const accessToken =
    target && target.authInfo
      ? target.authInfo.access_token
      : process.env.access_token

  if (!accessToken) {
    throw new Error(`A valid access token was not found.
    Please provide an access token in the access_token property in your .env file or as part of the authInfo in your target configuration.`)
  }

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
      displayResult(err, 'An error has occurred when processing context.', null)
    })

  if (createdContext) {
    displayResult(
      null,
      null,
      `Context '${name}' with id '${createdContext.id}' successfully created!`
    )
  }
}

async function edit(config, target) {
  const sasjs = new SASjs({
    serverUrl: target.serverUrl,
    serverType: target.serverType
  })

  const accessToken =
    target && target.authInfo
      ? target.authInfo.access_token
      : process.env.access_token

  if (!accessToken) {
    throw new Error(`A valid access token was not found.
    Please provide an access token in the access_token property in your .env file or as part of the authInfo in your target configuration.`)
  }

  const { name, updatedContext } = config

  const editedContext = await sasjs
    .editContext(name, updatedContext, accessToken)
    .catch((err) => {
      displayResult(err, 'An error has occurred when processing context.', null)
    })

  if (editedContext) {
    const editedContextName = editedContext.result.name || ''

    displayResult(
      null,
      null,
      `Context '${editedContextName}' successfully updated!`
    )
  }
}

async function remove(config, target) {
  const sasjs = new SASjs({
    serverUrl: target.serverUrl,
    serverType: target.serverType
  })

  const accessToken =
    target && target.authInfo
      ? target.authInfo.access_token
      : process.env.access_token

  if (!accessToken) {
    throw new Error(`A valid access token was not found.
    Please provide an access token in the access_token property in your .env file or as part of the authInfo in your target configuration.`)
  }

  const { name } = config

  const deletedContext = await sasjs
    .deleteContext(name, accessToken)
    .catch((err) => {
      displayResult(
        err,
        `An error has occurred when deleting context '${name}'.`,
        null
      )
    })

  if (deletedContext) {
    displayResult(null, null, `Context '${name}' has been deleted!`)
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

function displayResult(err, failureMessage, successMessage) {
  if (err) {
    if (err.hasOwnProperty('body')) {
      try {
        const body = JSON.parse(err.body)
        const message = body.message || ''
        const details = body.details || ''

        console.log(
          chalk.redBright(
            failureMessage,
            `${message}${details ? '\n' + details : ''}`
          )
        )
      } catch (parseError) {
        console.log(chalk.redBright('Unable to parse error\n', parseError))
        console.log(chalk.redBright(failureMessage, err.body))
      }
    } else {
      console.log(chalk.redBright(failureMessage, err))
    }
  }

  if (successMessage) {
    console.log(chalk.greenBright.bold.italic(successMessage))
  }
}
