import { Command } from '../../utils/command'
import { getBuildTarget } from '../../utils/config-utils'
import { execute } from './execute'
import { displayResult } from '../../utils/displayResult'

export async function processFlow(commandLine: string[] | string) {
  const command = new Command(commandLine)
  const subCommand = command.getSubCommand()
  const source = command.getFlagValue('source')
  const logFolder = command.getFlagValue('logFolder')
  const csvFile = command.getFlagValue('csvFile')
  const targetName = command.getFlagValue('target')
  const target = await getBuildTarget(targetName)

  let result

  switch (subCommand) {
    case 'execute':
      await execute(
        source,
        logFolder,
        csvFile,
        target,
        command.prefixAppLoc
      ).catch((err) => {
        displayResult(err)

        result = err
      })

      break
    default:
      break
  }

  return result
}
