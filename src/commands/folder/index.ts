import { getAccessToken, findTargetInConfiguration } from '../../utils/config'
import { displayError } from '../../utils/displayResult'
import { create } from './create'
import { move } from './move'
import { deleteFolder } from './delete'
import { Command } from '../../utils/command'
import { list } from './list'
import { getAdapterInstance } from '../../utils/utils'

export async function folder(command: Command) {
  const subCommand = command.getSubCommand()

  const subCommands = {
    list: 'list',
    create: 'create',
    move: 'move',
    delete: 'delete'
  }

  if (!subCommands.hasOwnProperty(subCommand)) {
    const message = `Not supported folder command. Supported commands are:\n${Object.keys(
      subCommands
    ).join('\n')}`

    throw new Error(message)
  }

  const forceFlag = command.getFlag('force')
  const targetName = command.getFlagValue('target') as string
  let folderPath = command.values.join(' ')

  const { target } = await findTargetInConfiguration(targetName)

  if (!folderPath) {
    process.logger?.error(
      `Please provide folder path (eg 'sasjs folder <command> /Public/folder').`
    )

    return
  }

  folderPath = Command.prefixAppLoc(target.appLoc, folderPath) as string

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
    case subCommands.list:
      return await list(folderPath, sasjs, accessToken)
    default:
      break
  }
}
