import chalk from 'chalk'
import { create } from './create'
import { edit } from './edit'
import { remove } from './remove'
import { list } from './list'
import { exportContext } from './export'
import { fileExists, readFile } from '../../utils/file-utils'
import { getBuildTarget, getAccessToken } from '../../utils/config-utils'
import { displayResult } from '../../utils/displayResult'
import SASjs from '@sasjs/adapter/node'

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
  let configPathFlagIndex

  const getConfig = async () => {
    configPathFlagIndex = commandLine.indexOf('--source')

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

  const getContextName = (upToSourceFlag = false) => {
    let contextName = ''

    if (targetNameFlagIndex === -1) {
      contextName = commandLine.slice(2).join(' ')
    } else {
      contextName = commandLine
        .slice(2, upToSourceFlag ? configPathFlagIndex : targetNameFlagIndex)
        .join(' ')
    }

    if (!contextName && !upToSourceFlag) {
      console.log(
        chalk.redBright(
          `Provide a context name (eg 'sasjs context <command> contextName')`
        )
      )

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
    displayResult(err)
  })

  let output

  switch (command) {
    case commands.create:
      config = await getConfig()

      if (!config) break

      parsedConfig = parseConfig(config)

      output = await create(parsedConfig, sasjs, accessToken)

      break
    case commands.edit: {
      config = await getConfig()

      const contextName = getContextName(true)

      parsedConfig = parseConfig(config)

      output = await edit(contextName, parsedConfig, sasjs, accessToken)

      break
    }
    case commands.delete: {
      const contextName = getContextName()

      if (contextName) {
        output = remove(contextName, sasjs, accessToken)
      }

      break
    }
    case commands.list:
      output = list(target, sasjs, accessToken)

      break
    case commands.export: {
      const contextName = getContextName()

      if (contextName) {
        output = await exportContext(contextName, sasjs, accessToken)
      }

      break
    }
    default:
      break
  }

  return output
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
