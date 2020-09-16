import chalk from 'chalk'
import { create } from './create'
import { edit } from './edit'
import { remove } from './remove'
import { list } from './list'
import { getUserInput } from '../utils/input-utils'
import { fileExists, readFile } from '../utils/file-utils'
import { getBuildTargets } from '../utils/config-utils'

export async function processContext(command) {
  const commands = {
    create: 'create',
    edit: 'edit',
    delete: 'delete',
    list: 'list'
  }

  if (!commands.hasOwnProperty(command)) {
    console.log(chalk.redBright('Not supported context command.'))

    return
  }

  const targetName = await getAndValidateTargetName()
  const target = await getTarget(targetName)

  let configPath
  let config
  let validationMap
  let parsedConfig

  switch (command) {
    case commands.create:
      configPath = await getAndValidateConfigPath()
      config = await readFile(configPath)

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
    case commands.edit:
      configPath = await getAndValidateConfigPath()
      config = await readFile(configPath)

      validationMap = {
        name: '',
        updatedContext: {}
      }

      validateConfig(config, validationMap)

      parsedConfig = JSON.parse(config)

      edit(parsedConfig, target)

      break
    case commands.delete:
      const contextName = await getAndValidateContextName()

      remove(contextName, target)

      break
    case commands.list:
      list(target)

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
  const configPathField = {
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

  return await getAndValidateField(configPathField, validator, message)
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

async function getAndValidateContextName() {
  const contextNameField = {
    name: 'contextName',
    type: 'string',
    description: chalk.cyanBright(
      `${chalk.greenBright('Please provide context name')}`
    )
  }

  const validator = (value) => value !== ''
  const message = 'Invalid input. Context name should be not empty string.'

  return await getAndValidateField(contextNameField, validator, message)
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
