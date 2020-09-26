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

  let folderPath = ''

  if (targetFlagIndex === -1) {
    folderPath = commandLine.slice(2).join(' ')
  } else {
    folderPath = commandLine.slice(2, targetFlagIndex).join(' ')
  }

  if (!folderPath || folderPath === '-t' || folderPath === '--target') {
    console.log(
      chalk.redBright(
        `Please provide folder path (eg 'sasjs folder <command> /Public/folder').`
      )
    )

    return
  }

  // Folder path should has prefix '/'
  if (!/^\//.test(folderPath)) folderPath = '/' + folderPath

  switch (command) {
    case commands.create:
      create(folderPath, target)

      break
    case commands.delete:
      remove(folderPath, target)

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
  const folder = sanitize(pathMap.pop())
  let parentFolderPath = pathMap.join('/')

  // TODO: added force flag
  const createdFolder = await sasjs
    .createFolder(folder, parentFolderPath, null, accessToken)
    .catch((err) => {
      displayResult(err)
    })

  if (createdFolder) {
    displayResult(
      null,
      null,
      `Folder '${
        parentFolderPath + '/' + folder
      }' has been successfully created.`
    )
  }
}

const remove = async (path, target) => {
  const sasjs = new SASjs({
    serverUrl: target.serverUrl,
    serverType: target.serverType
  })

  const accessToken = await getAccessToken(target).catch((err) =>
    displayResult(err)
  )

  const deletedFolder = await sasjs
    .deleteFolder(path, accessToken)
    .catch((err) => {
      displayResult(err)
    })

  console.log(`[deletedFolder]`, deletedFolder)

  // if (deletedFolder) {
  //   displayResult(null, null, dele)
  // }
}

const sanitize = (path) => path.replace(/[^0-9a-zA-Z_\-. ]/g, '_')
