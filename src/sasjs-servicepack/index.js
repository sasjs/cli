import { servicePackDeploy } from './deploy'
import {
  getCommandParameter,
  getCommandParameterLastMultiWord,
  isFlagPresent
} from '../utils/command-utils'

import chalk from 'chalk'

export async function processServicepack(commandLine) {
  const command = commandLine[1]
  const commands = {
    deploy: 'deploy'
  }

  if (!commands.hasOwnProperty(command)) {
    console.log(
      chalk.redBright(
        `Not supported servicepack command. Supported commands are:\n${Object.keys(
          commands
        ).join('\n')}`
      )
    )

    return
  }

  const commandExample =
    'sasjs servicepack <command> --source ../viyadeploy.json --target targetName'

  let output

  switch (command) {
    case commands.deploy:
      const targetName = getCommandParameterLastMultiWord(
        '-t',
        '--target',
        commandLine,
        commandExample
      )
      const jsonFilePath = getCommandParameter(
        '-s',
        '--source',
        commandLine,
        commandExample
      )

      const isForced = isFlagPresent('-f', commandLine)

      output = await servicePackDeploy(jsonFilePath, targetName, isForced)
      break
  }

  return output
}
