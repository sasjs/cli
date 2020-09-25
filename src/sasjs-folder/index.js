import SASjs from '@sasjs/adapter/node'
import chalk from 'chalk'
import { getBuildTarget, getAccessToken } from '../utils/config-utils'
import { displayResult } from '../utils/displayResult'

export async function fileSystem(commandLine) {
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

  let targetName = []
  let targetFlagIndex = commandLine.indexOf('--target')

  if (targetFlagIndex === -1) targetFlagIndex = commandLine.indexOf('-t')

  if (targetFlagIndex !== -1) {
    for (let i = targetFlagIndex + 1; i < commandLine.length; i++) {
      targetName.push(commandLine[i])
    }
  }

  targetName = targetName.join(' ')

  const target = await getBuildTarget(targetName)

  const folderPath = commandLine[2]

  if (!folderPath || folderPath === '-t' || folderPath === '--target') {
    console.log(
      chalk.redBright(
        `Please provide folder path (eg 'sasjs folder <command> /Public/folder').`
      )
    )

    return
  }

  switch (command) {
    case commands.create:
      create(folderPath, target)

      break
    default:
      break
  }
}

const create = async (path, target) => {
  const sasjs = new SASjs({
    serverUrl: target.serverUrl,
    serverType: target.serverType
  })

  const accessToken = await getAccessToken(target).catch((err) =>
    displayResult(err)
  )

  const pathMap = path.split('/')
  const folder = pathMap.pop()
  const parentFolderPath = pathMap.join('/')

  console.log(`[folder]`, folder)
  console.log(`[parentFolderPath]`, parentFolderPath)

  const createdFolder = await sasjs.createFolder(
    folder,
    parentFolderPath,
    null,
    accessToken
  )

  console.log(`[createdFolder]`, createdFolder)
}
