import { Command } from '../../utils/command'
import { getBuildTarget } from '../../utils/config-utils'
import { execute } from './execute'

// sasjs flow execute --source /local/flow.json --logFolder /local/log/folder --csvFile /local/some.csv --target targetName
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
      result = await execute(
        source,
        logFolder,
        csvFile,
        target,
        command.prefixAppLoc
      )

      break
    default:
      break
  }

  return result
}
