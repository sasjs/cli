import chalk from 'chalk'

export function isFlagPresent(flag, commandLine) {
  return commandLine.indexOf(flag) > -1
}

export function getCommandParameter(commandFlag, commandFlagLong, commandLine, commandExample = '') {
  let parameterValueFlagIndex = commandLine.indexOf(commandFlagLong)

  if (parameterValueFlagIndex === -1)
    parameterValueFlagIndex = commandLine.indexOf(commandFlag)

  if (parameterValueFlagIndex === -1) {

    if (commandExample.length > 0) {
      console.log(
        chalk.redBright(`'${commandFlag || commandFlagLong}' flag is missing (eg '${commandExample}')`)
      )
    }

    return
  }

  let parameterValue = commandLine[parameterValueFlagIndex + 1]

  return parameterValue
}

export function getCommandParameterLastMultiWord(commandFlag, commandFlagLong, commandLine, commandExample = '') {
  let parameterValue = []
  let parameterFlagIndex = commandLine.indexOf(commandFlagLong)

  if (parameterFlagIndex === -1)
    parameterFlagIndex = commandLine.indexOf(commandFlag)

  if (parameterFlagIndex !== -1) {
    for (let i = parameterFlagIndex + 1; i < commandLine.length; i++) {
      if (
        commandLine[i].includes('-') &&
        commandExample.length > 0
      ) {
        throw `Parameter '${commandFlagLong || commandFlag}' has to be provided as the last argument (eg ${commandExample})`
      }

      parameterValue.push(commandLine[i])
    }
  }

  parameterValue = parameterValue.join(' ')

  return parameterValue
}