import chalk from 'chalk'
import { create } from './create'
import { edit } from './edit'
import { remove } from './remove'
import { list } from './list'
import { exportContext } from './export'
import { fileExists, readFile } from '../utils/file-utils'
import { getBuildTarget } from '../utils/config-utils'

export async function processContext(commandLine) {
  const command = commandLine[1]
  const commands = {
    create: 'create',
    edit: 'edit',
    delete: 'delete',
    list: 'list',
    export: 'export'
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

  const commandExample =
    'sasjs context <command> --source ../contextConfig.json --target targetName'

  let targetName = []
  let targetNameFlagIndex = commandLine.indexOf('--target')

  if (targetNameFlagIndex === -1)
    targetNameFlagIndex = commandLine.indexOf('-t')

  if (targetNameFlagIndex !== -1) {
    for (let i = targetNameFlagIndex + 1; i < commandLine.length; i++) {
      if (commandLine[i] === '--source' || commandLine[i] === '-s') {
        throw `Target name has to be provided as the last argument (eg ${commandExample})`
      }

      targetName.push(commandLine[i])
    }
  }

  targetName = targetName.join(' ')

  const target = await getBuildTarget(targetName)

  let configPath
  let config
  let parsedConfig

  const getConfig = async () => {
    let configPathFlagIndex = commandLine.indexOf('--source')

    if (configPathFlagIndex === -1)
      configPathFlagIndex = commandLine.indexOf('-s')

    if (configPathFlagIndex === -1) {
      console.log(
        chalk.redBright(`'--source' flag is missing (eg '${commandExample}')`)
      )

      return
    }

    configPath = commandLine[configPathFlagIndex + 1]

    if (!configPath || !validateConfigPath(configPath)) {
      console.log(
        chalk.redBright(
          `Provide a path to context config file (eg '${commandExample}')`
        )
      )

      return
    }

    return await readFile(configPath)
  }

  const getContextName = () => {
    let contextName = ''

    if (targetNameFlagIndex === -1) {
      contextName = commandLine.slice(2).join(' ')
    } else {
      contextName = commandLine.slice(2, targetNameFlagIndex).join(' ')
    }

    if (!contextName) {
      console.log(
        chalk.redBright(
          `Provide a context name (eg 'sasjs context <command> contextName')`
        )
      )

      return null
    }

    return contextName
  }

  switch (command) {
    case commands.create:
      config = await getConfig()

      if (!config) break

      parsedConfig = parseConfig(config)

      create(parsedConfig, target)

      break
    case commands.edit:
      config = await getConfig()

      parsedConfig = parseConfig(config)

      edit(parsedConfig, target)

      break
    case commands.delete: {
      const contextName = getContextName()

      if (contextName) remove(contextName, target)

      break
    }
    case commands.list:
      list(target)

      break
    case commands.export: {
      const contextName = getContextName()

      if (contextName) exportContext(contextName, target)

      break
    }
    default:
      break
  }
}

async function validateConfigPath(path) {
  if (!path) return false

  const isJsonFile = /\.json$/i.test(path)

  if (!isJsonFile) return false

  return await fileExists(path)
}

function parseConfig(config) {
  try {
    const parsedConfig = JSON.parse(config)

    return parsedConfig
  } catch (err) {
    throw new Error('Context config file is not a valid JSON file.')
  }
}
