import { findTargetInConfiguration, getAuthConfig } from '../../utils/config'
import { displayError } from '../../utils/displayResult'
import SASjs from '@sasjs/adapter/node'
import { execute } from './execute'
import { Command } from '../../utils/command'
import { AuthConfig } from '@sasjs/utils'

export async function processJob(command: Command, sasjs?: SASjs) {
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
  const source = command.getFlagValue('source') as string | undefined
  const streamLog = !!command.getFlagValue('streamLog')

  const { target } = await findTargetInConfiguration(targetName)

  const jobPath = command.prefixAppLoc(target.appLoc, command.values as any)

  if (!sasjs) {
    sasjs = new SASjs({
      serverUrl: target.serverUrl,
      allowInsecureRequests: target.allowInsecureRequests,
      appLoc: target.appLoc,
      serverType: target.serverType,
      debug: true
    })
  }

  const authConfig = await getAuthConfig(target).catch((err) => {
    displayError(err, 'Error obtaining access token.')
  })

  let result

  switch (subCommand) {
    case subCommands.execute:
      result = await execute(
        sasjs,
        authConfig as AuthConfig,
        jobPath as string,
        target,
        waitForJob,
        output,
        log,
        status,
        returnStatusOnly,
        ignoreWarnings,
        source,
        streamLog
      )

      break
    default:
      break
  }

  return result
}
