import chalk from 'chalk'
import { create } from './create'
import { edit } from './edit'
import { remove } from './remove'
import { list } from './list'
import { fileExists, readFile } from '../utils/file-utils'
import { getBuildTargets } from '../utils/config-utils'

export async function processContext(commandLine) {
  const command = commandLine[1]
  const commands = {
    create: 'create',
    edit: 'edit',
    delete: 'delete',
    list: 'list'
  }

  if (!commands.hasOwnProperty(command)) {
    console.log(
      chalk.redBright(
        `Not supported context command. Supported commands are:\n${Object.keys(
          commands
        ).join('\n')}`
      )
    )

    return
  }

  const targetName = commandLine[2]
  const commandExample =
    'sasjs context <command> myTarget -source ../contextConfig.json'

  if (!targetName) {
    console.log(
      chalk.redBright(`Provide a target name (ag '${commandExample}')`)
    )

    return
  }

  const target = await getTarget(targetName)

  let configPath
  let config
  let validationMap
  let parsedConfig

  const getConfig = async () => {
    const configPathFlag = commandLine[3]

    if (configPathFlag !== '-source') {
      console.log(
        chalk.redBright(`'-source' flag is missing (ag '${commandExample}')`)
      )

      return
    }

    configPath = commandLine[4]

    if (!configPath || !validateConfigPath(configPath)) {
      console.log(
        chalk.redBright(
          `Provide a path to context config file (ag '${commandExample}')`
        )
      )

      return
    }

    return await readFile(configPath)
  }

  switch (command) {
    case commands.create:
      config = await getConfig()

      if (!config) break

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
      config = await getConfig()

      validationMap = {
        name: '',
        updatedContext: {}
      }

      validateConfig(config, validationMap)

      parsedConfig = JSON.parse(config)

      edit(parsedConfig, target)

      break
    case commands.delete:
      const contextName = commandLine.slice(3).join(' ')

      if (!contextName) {
        console.log(
          chalk.redBright(
            `Provide a context name (ag 'sasjs context delete myContext')`
          )
        )

        break
      }

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

async function validateConfigPath(path) {
  if (!path) return false

  const isJsonFile = /\.json$/i.test(path)

  if (!isJsonFile) return false

  return await fileExists(path)
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
