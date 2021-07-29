import { Command } from '../../utils/command'
import { findTargetInConfiguration } from '../../utils/config'
import { execute } from './execute'
import { displayError } from '../../utils/displayResult'
import { getProjectRoot } from '../../utils/config'
import path from 'path'
import SASjs from '@sasjs/adapter/node'

export async function processFlow(command: Command, sasjs?: SASjs) {
  const subCommand = command.getSubCommand()
  const source = command.getFlagValue('source') as string
  const csvFile = command.getFlagValue('csvFile') as string
  const targetName = command.getFlagValue('target') as string
  const { target } = await findTargetInConfiguration(targetName)
  const logFolder =
    (command.getFlagValue('logFolder') as string) ||
    path.join(await getProjectRoot(), 'sasjsbuild', 'logs')
  const streamLog = !!command.getFlagValue('streamLog')
  let result

  if (!sasjs) {
    sasjs = new SASjs({
      serverUrl: target.serverUrl,
      allowInsecureRequests: target.allowInsecureRequests,
      appLoc: target.appLoc,
      serverType: target.serverType
    })
  }

  switch (subCommand) {
    case 'execute':
      const csvFilePath = await execute(
        source,
        logFolder,
        csvFile,
        target,
        streamLog,
        sasjs
      ).catch((err) => {
        displayError(err, 'An error has occurred when executing this flow.')

        result = err
      })

      const pathSepRegExp = new RegExp(path.sep.replace(/\\/g, '\\\\'), 'g')

      if (csvFilePath) {
        process.logger?.info(
          `CSV file located at: ${(csvFilePath as string).replace(
            pathSepRegExp,
            '/'
          )}`
        )
      }

      break
    default:
      break
  }

  return result
}
