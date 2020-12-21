import SASjs from '@sasjs/adapter/node'
import chalk from 'chalk'
import { getBuildTarget, getAccessToken } from '../../utils/config-utils'
import { displayResult } from '../../utils/displayResult'
import { create } from './create'
import { move } from './move'
import { remove } from './remove'
import { Command } from '../../utils/command'

export async function folder(commandLine) {
  const command = new Command(commandLine)
  const subCommand = command.getSubCommand()

  const subCommands = {
    create: 'create',
    move: 'move',
    delete: 'delete'
  }

  if (!subCommands.hasOwnProperty(subCommand)) {
    const message = `Not supported folder command. Supported commands are:\n${Object.keys(
      subCommands
    ).join('\n')}`

    console.log(chalk.redBright(message))

    return
  }

  const forceFlag = command.getFlag('force')
  const targetName = command.getFlagValue('target')
  let folderPath = command.values.join(' ')

  const target = await getBuildTarget(targetName)

  if (!folderPath) {
    console.log(
      chalk.redBright(
        `Please provide folder path (eg 'sasjs folder <command> /Public/folder').`
      )
    )

    return
  }
  folderPath = command.prefixAppLoc(target.appLoc, folderPath)

  const sasjs = new SASjs({
    serverUrl: target.serverUrl,
    serverType: target.serverType
  })

  const accessToken = await getAccessToken(target).catch((err) =>
    displayResult(err)
  )

  switch (subCommand) {
    case subCommands.create:
      return await create(
        folderPath,
        sasjs,
        accessToken,
        forceFlag !== undefined
      )
    case subCommands.delete:
      return await remove(folderPath, sasjs, accessToken)
    case subCommands.move:
      return await move(folderPath, sasjs, accessToken)
    default:
      break
  }
}
