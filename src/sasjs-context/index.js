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

  validateConfig(config)
  const parsedConfig = JSON.parse(config)

  switch (command) {
    case 'create':
      create(parsedConfig, target)
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

function validateConfig(config) {
  const validationErrorType = 'validation'

  try {
    const parsedConfig = JSON.parse(config)
    const configKeys = [
      'name',
      'launchName',
      'sharedAccountId',
      'autoExecLines',
      'authorizedUsers'
    ]
    const missedKeys = []

    for (const requiredKey of configKeys) {
      if (!parsedConfig.hasOwnProperty(requiredKey))
        missedKeys.push(requiredKey)
    }

    if (missedKeys.length) {
      const error = {
        type: validationErrorType,
        message: `Context config file doesn't have all required keys. Required keys missed:\n${missedKeys.join(
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
          chalk.redBright(
            'AAn error has occurred when processing context.',
            err
          )
        )
      }
    })

  if (createdContext) {
    console.log(
      chalk.greenBright.bold.italic(`Context '${name}' successfully created!`)
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
