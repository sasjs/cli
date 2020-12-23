import { servicePackDeploy } from './deploy'
import { Command } from '../../utils/command'

import chalk from 'chalk'

export async function processServicepack(commandLine: string | string[]) {
  const command = new Command(commandLine)
  const subCommand = command.getSubCommand()
  const subCommands = {
    deploy: 'deploy'
  }

  if (!subCommands.hasOwnProperty(subCommand)) {
    console.log(
      chalk.redBright(
        `Not supported servicepack command. Supported commands are:\n${Object.keys(
          subCommands
        ).join('\n')}`
      )
    )

    return
  }

  const targetName = command.getFlagValue('target')
  const jsonFilePath = command.getFlagValue('source')
  const isForced = command.getFlagValue('force')

  let output

  switch (subCommand) {
    case subCommands.deploy:
      output = await servicePackDeploy(jsonFilePath, targetName, isForced)

      break
  }

  return output
}
