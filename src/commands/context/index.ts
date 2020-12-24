import chalk from 'chalk'
import { create } from './create'
import { edit } from './edit'
import { remove } from './remove'
import { list } from './list'
import { exportContext } from './export'
import { fileExists, readFile } from '../../utils/file'
import {
  getAccessToken,
  findTargetInConfiguration
} from '../../utils/config-utils'
import { displayError } from '../../utils/displayResult'
import { Command } from '../../utils/command'
import SASjs from '@sasjs/adapter/node'

export async function processContext(command: Command) {
  const subCommand = command.getSubCommand()
  const subCommands = {
    create: 'create',
    edit: 'edit',
    delete: 'delete',
    list: 'list',
    export: 'export'
  }

  if (!subCommands.hasOwnProperty(subCommand)) {
    console.log(
      chalk.redBright(
        `Not supported context command. Supported commands are:\n${Object.keys(
          subCommands
        ).join('\n')}`
      )
    )

    return
  }

  const targetName = command.getFlagValue('target')
  const { target } = await findTargetInConfiguration(targetName)

  const commandExample =
    'sasjs context <command> --source ../contextConfig.json --target targetName'

  const getConfig = async () => {
    const configPath = command.getFlagValue('source')

    if (!configPath) {
      const message = `'--source' flag is missing (eg '${commandExample}')`

      console.log(chalk.redBright(message))

      return
    } else if (!validateConfigPath(configPath)) {
      const message = `Provide a path to context config file (eg '${commandExample}')`

      console.log(chalk.redBright(message))

      return
    }

    return await readFile(configPath)
  }

  const getContextName = () => {
    let contextName = command.values.join(' ')

    if (!contextName) {
      const message = `Provide a context name (eg 'sasjs context <command> contextName')`

      console.log(chalk.redBright(message))

      return null
    }

    return contextName
  }

  const sasjs = new SASjs({
    serverUrl: target.serverUrl,
    appLoc: target.appLoc,
    serverType: target.serverType
  })

  const accessToken = await getAccessToken(target).catch((err) => {
    displayError(err, 'Error obtaining access token.')
  })

  let config
  let parsedConfig
  let output

  switch (subCommand) {
    case subCommands.create:
      config = await getConfig()

      if (!config) break

      parsedConfig = parseConfig(config)

      output = await create(parsedConfig, sasjs, accessToken as string)

      break
    case subCommands.edit: {
      config = await getConfig()

      const contextName = getContextName()

      parsedConfig = parseConfig(config)

      output = await edit(
        contextName,
        parsedConfig,
        sasjs,
        accessToken as string
      )

      break
    }
    case subCommands.delete: {
      const contextName = getContextName()

      if (contextName) {
        output = remove(contextName, sasjs, accessToken as string)
      }

      break
    }
    case subCommands.list:
      output = list(target, sasjs, accessToken as string)

      break
    case subCommands.export: {
      const contextName = getContextName()

      if (contextName) {
        output = await exportContext(contextName, sasjs, accessToken as string)
      }

      break
    }
    default:
      break
  }

  return output
}

async function validateConfigPath(path: string) {
  if (!path) return false

  const isJsonFile = /\.json$/i.test(path)

  if (!isJsonFile) return false

  return await fileExists(path)
}

function parseConfig(config: string) {
  try {
    const parsedConfig = JSON.parse(config)

    return parsedConfig
  } catch (err) {
    throw new Error('Context config file is not a valid JSON file.')
  }
}
