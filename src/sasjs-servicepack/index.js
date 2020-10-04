import { servicePackDeploy } from './deploy'

import chalk from 'chalk'

export async function processServicepack(commandLine) {
  const command = commandLine[1]
  const commands = {
    deploy: 'deploy'
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

  const commandExample =
    'sasjs servicepack <command> --source ../viyadeploy.json --target targetName'

  const getIsForced = () => {
    let configPathFlagIndex = commandLine.indexOf('-f')

    if (configPathFlagIndex === -1) return false

    return true
  }

  const getTargetName = () => {
    let targetName = []
    let targetNameFlagIndex = commandLine.indexOf('--target')

    if (targetNameFlagIndex === -1)
      targetNameFlagIndex = commandLine.indexOf('-t')

    if (targetNameFlagIndex !== -1) {
      for (let i = targetNameFlagIndex + 1; i < commandLine.length; i++) {
        if (
          commandLine[i] === '--source' ||
          commandLine[i] === '-s' ||
          commandLine[i] === '-f'
        ) {
          throw `Target name has to be provided as the last argument (eg ${commandExample})`
        }

        targetName.push(commandLine[i])
      }
    }

    targetName = targetName.join(' ')

    return targetName
  }

  const getSourcePath = () => {
    let configPathFlagIndex = commandLine.indexOf('--source')

    if (configPathFlagIndex === -1)
      configPathFlagIndex = commandLine.indexOf('-s')

    if (configPathFlagIndex === -1) {
      console.log(
        chalk.redBright(`'--source' flag is missing (eg '${commandExample}')`)
      )

      return
    }

    let sourcePath = commandLine[configPathFlagIndex + 1]

    return sourcePath
  }

  switch (command) {
    case commands.deploy:
      let targetName = getTargetName()
      let jsonFilePath = getSourcePath()
      let isForced = getIsForced()

      servicePackDeploy(jsonFilePath, targetName, isForced)
      break
  }
}
