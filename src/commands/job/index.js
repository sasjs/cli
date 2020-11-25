import chalk from 'chalk'
import { getBuildTarget, getAccessToken } from '../../utils/config-utils'
import { displayResult } from '../../utils/displayResult'
import SASjs from '@sasjs/adapter/node'
import { execute } from './execute'
import { Command } from '../../utils/command'

export async function processJob(commandLine) {
  const command = new Command(commandLine)

  const subCommand = command.getSubCommand()
  const subCommands = {
    execute: 'execute'
  }

  if (!subCommands.hasOwnProperty(subCommand)) {
    console.log(
      chalk.redBright(
        `Not supported context command. Supported commands are:\n${Object.keys(
          subCommands
        ).join('\n')}`
      )
    )

    return
  }

  const targetName = command.getFlagValue('target')
  const waitForJob = command.getFlagValue('wait')
  const output = command.getFlagValue('output')
  const log = command.getFlagValue('logFile')
  const status = command.getFlagValue('status')

  const target = await getBuildTarget(targetName)

  const jobPath = command.prefixAppLoc(target.appLoc, command.values)

  const sasjs = new SASjs({
    serverUrl: target.serverUrl,
    appLoc: target.appLoc,
    serverType: target.serverType
  })

  const accessToken = await getAccessToken(target).catch((err) => {
    displayResult(err)
  })

  let result

  switch (subCommand) {
    case subCommands.execute:
      result = await execute(
        sasjs,
        accessToken,
        jobPath,
        target,
        waitForJob,
        output,
        log,
        status
      )

      break
    default:
      break
  }

  return result
}
