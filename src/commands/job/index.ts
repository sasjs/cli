import { findTargetInConfiguration, getAccessToken } from '../../utils/config'
import { displayError } from '../../utils/displayResult'
import SASjs from '@sasjs/adapter/node'
import { execute } from './execute'
import { Command } from '../../utils/command'

export async function processJob(command: Command) {
  const subCommand = command.getSubCommand()
  const subCommands = {
    execute: 'execute'
  }

  if (!subCommands.hasOwnProperty(subCommand)) {
    throw new Error(
      `Unsupported context command. Supported commands are:\n${Object.keys(
        subCommands
      ).join('\n')}`
    )
  }

  const targetName = command.getFlagValue('target') as string
  const waitForJob = command.getFlagValue('wait') as boolean
  const output = command.getFlagValue('output') as string
  const logFlag = command.getFlag('logFile')
  const log = (logFlag ? logFlag.value ?? true : undefined) as string
  const status = command.getFlagValue('status') as string
  const returnStatusOnly = command.getFlagValue('returnStatusOnly') as boolean
  const ignoreWarnings = command.getFlagValue('ignoreWarnings') as boolean

  const { target } = await findTargetInConfiguration(targetName)

  const jobPath = command.prefixAppLoc(target.appLoc, command.values as any)

  const sasjs = new SASjs({
    serverUrl: target.serverUrl,
    appLoc: target.appLoc,
    serverType: target.serverType,
    debug: true
  })

  const accessToken = await getAccessToken(target).catch((err) => {
    displayError(err, 'Error obtaining access token.')
  })

  let result

  switch (subCommand) {
    case subCommands.execute:
      result = await execute(
        sasjs,
        accessToken as string,
        jobPath as string,
        target,
        waitForJob,
        output,
        log,
        status,
        returnStatusOnly,
        ignoreWarnings
      )

      break
    default:
      break
  }

  return result
}
