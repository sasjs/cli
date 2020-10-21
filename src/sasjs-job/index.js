import chalk from 'chalk'
import {
  getBuildTarget,
  getAccessToken,
  sanitizeAppLoc
} from '../utils/config-utils'
import SASjs from '@sasjs/adapter/node'
import { execute } from './execute'

export async function processJob(commandLine) {
  commandLine.shift() // remove 'job' from command line

  const command = commandLine.shift()
  const commands = {
    execute: 'execute'
  }

  if (!commands.hasOwnProperty(command)) {
    console.log(
      chalk.redBright(
        `Not supported context command. Supported commands are:\n${Object.keys(
          commands
        ).join('\n')}`
      )
    )

    return
  }

  let waitFlagIndex = commandLine.indexOf('--wait')
  if (waitFlagIndex === -1) waitFlagIndex = commandLine.indexOf('-w')

  let outputFlagIndex = commandLine.indexOf('--output')
  if (outputFlagIndex === -1) outputFlagIndex = commandLine.indexOf('-o')

  let targetName = []
  let targetNameFlagIndex = commandLine.indexOf('--target')

  if (targetNameFlagIndex === -1)
    targetNameFlagIndex = commandLine.indexOf('-t')

  if (targetNameFlagIndex !== -1) {
    for (let i = targetNameFlagIndex + 1; i < commandLine.length; i++) {
      if (i === waitFlagIndex || i === outputFlagIndex) break

      targetName.push(commandLine[i])
    }
  }

  targetName = targetName.join(' ')

  const target = await getBuildTarget(targetName)

  let jobPath = commandLine[0]
  jobPath = sanitizeAppLoc(jobPath)

  const sasjs = new SASjs({
    serverUrl: target.serverUrl,
    appLoc: target.appLoc,
    serverType: target.serverType
  })

  const accessToken = await getAccessToken(target).catch((err) => {
    displayResult(err)
  })

  let output
  const waitForJob = waitFlagIndex !== -1
  const displayOutput = outputFlagIndex !== -1

  switch (command) {
    case commands.execute:
      output = await execute(
        sasjs,
        accessToken,
        jobPath,
        target,
        waitForJob,
        displayOutput
      )

      break
    default:
      break
  }

  return output
}
