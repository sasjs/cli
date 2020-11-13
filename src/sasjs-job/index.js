import chalk from 'chalk'
import {
  getBuildTarget,
  getAccessToken,
  sanitizeAppLoc
} from '../utils/config-utils'
import { displayResult } from '../utils/displayResult'
import SASjs from '@sasjs/adapter/node'
import { execute } from './execute'
import { Command } from '../utils/command'

export async function processJob(commandLine) {
  const command = new Command(commandLine)

  const subCommand = command.values.shift()
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

  let targetName = command.flags.find((flag) => flag.name === 'target')
  targetName = targetName ? targetName.value : ''

  const waitForJob =
    command.flags.find((flag) => flag.name === 'wait') !== undefined

  let output = command.flags.find((flag) => flag.name === 'output')
  output = output ? (output.value ? output.value : true) : null

  let log = command.flags.find((flag) => flag.name === 'log')
  log = log ? (log.value ? log.value : true) : null

  const target = await getBuildTarget(targetName)

  let jobPath = command.values.join('')

  if (!/^\//.test(jobPath)) {
    const { appLoc } = target

    jobPath = (/\/$/.test(appLoc) ? appLoc : appLoc + '/') + jobPath
  }

  jobPath = sanitizeAppLoc(jobPath)

  const sasjs = new SASjs({
    serverUrl: target.serverUrl,
    appLoc: target.appLoc,
    serverType: target.serverType,
    debug: true
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
        log
      )

      break
    default:
      break
  }

  return result
}
