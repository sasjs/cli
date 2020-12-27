import SASjs from '@sasjs/adapter/node'
import chalk from 'chalk'
import { getAccessToken, findTargetInConfiguration } from '../../utils/config'
import { displayError } from '../../utils/displayResult'
import { create } from './create'
import { move } from './move'
import { deleteFolder } from './delete'
import { Command } from '../../utils/command'
import { getAdapterInstance } from '../../utils/utils'

export async function folder(command: Command) {
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

  const { target } = await findTargetInConfiguration(targetName)

  if (!folderPath) {
    console.log(
      chalk.redBright(
        `Please provide folder path (eg 'sasjs folder <command> /Public/folder').`
      )
    )

    return
  }

  folderPath = command.prefixAppLoc(target.appLoc, folderPath) as string

  const sasjs = getAdapterInstance(target)

  const accessToken = await getAccessToken(target).catch((err) => {
    displayError(err, 'An error has occurred when obtaining an access token.')
    throw err
  })

  switch (subCommand) {
    case subCommands.create:
      return await create(
        folderPath,
        sasjs,
        accessToken,
        forceFlag !== undefined
      )
    case subCommands.delete:
      return await deleteFolder(folderPath, sasjs, accessToken)
    case subCommands.move:
      return await move(folderPath, sasjs, accessToken)
    default:
      break
  }
}
