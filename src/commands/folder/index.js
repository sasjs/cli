import SASjs from '@sasjs/adapter/node'
import chalk from 'chalk'
import { getBuildTarget, getAccessToken } from '../../utils/config-utils'
import { displayResult } from '../../utils/displayResult'
import { create } from './create'
import { move } from './move'
import { remove } from './remove'

export async function folder(commandLine) {
  const command = commandLine[1]
  const commands = {
    create: 'create',
    move: 'move',
    delete: 'delete'
  }

  if (!commands.hasOwnProperty(command)) {
    console.log(
      chalk.redBright(
        `Not supported folder command. Supported commands are:\n${Object.keys(
          commands
        ).join('\n')}`
      )
    )

    return
  }

  let forceFlagIndex = commandLine.indexOf('-f')

  if (forceFlagIndex === -1) forceFlagIndex = commandLine.indexOf('--force')

  let targetName = []
  let targetFlagIndex = commandLine.indexOf('-t')

  if (targetFlagIndex === -1) targetFlagIndex = commandLine.indexOf('--target')

  if (targetFlagIndex !== -1) {
    for (let i = targetFlagIndex + 1; i < commandLine.length; i++) {
      if (i === forceFlagIndex) break

      targetName.push(commandLine[i])
    }
  }

  targetName = targetName.join(' ')

  const target = await getBuildTarget(targetName)

  let folderPath = ''

  if (targetFlagIndex === -1 && forceFlagIndex === -1) {
    folderPath = commandLine.slice(2).join(' ')
  } else if (targetFlagIndex === -1) {
    folderPath = commandLine.slice(2, forceFlagIndex).join(' ')
  } else if (forceFlagIndex === -1) {
    folderPath = commandLine.slice(2, targetFlagIndex).join(' ')
  } else {
    folderPath = commandLine
      .slice(
        2,
        targetFlagIndex > forceFlagIndex ? forceFlagIndex : targetFlagIndex
      )
      .join(' ')
  }

  if (!folderPath) {
    console.log(
      chalk.redBright(
        `Please provide folder path (eg 'sasjs folder <command> /Public/folder').`
      )
    )

    return
  }

  // Folder path should has prefix '/'
  if (!/^\//.test(folderPath)) folderPath = '/' + folderPath

  const sasjs = new SASjs({
    serverUrl: target.serverUrl,
    serverType: target.serverType
  })

  const accessToken = await getAccessToken(target).catch((err) =>
    displayResult(err)
  )

  switch (command) {
    case commands.create:
      create(folderPath, sasjs, accessToken, forceFlagIndex !== -1)

      break
    case commands.delete:
      remove(folderPath, sasjs, accessToken)

      break
    case commands.move:
      move(folderPath, sasjs, accessToken)

      break
    default:
      break
  }
}
