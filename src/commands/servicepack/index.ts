import { servicePackDeploy } from './deploy'
import { Command } from '../../utils/command'

export async function processServicepack(command: Command) {
  const subCommand = command.getSubCommand()
  const subCommands = {
    deploy: 'deploy'
  }

  if (!subCommands.hasOwnProperty(subCommand)) {
    throw new Error(
      `Unsupported servicepack command. Supported commands are:\n${Object.keys(
        subCommands
      ).join('\n')}`
    )
  }

  const targetName = command.getFlagValue('target') as string
  const jsonFilePath = command.getFlagValue('source') as string
  const isForced = command.getFlagValue('force') as boolean

  let output

  switch (subCommand) {
    case subCommands.deploy:
      output = await servicePackDeploy(jsonFilePath, targetName, isForced)

      break
  }

  return output
}
