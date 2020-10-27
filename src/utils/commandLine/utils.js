import { Command } from './command'

export function parseCommandLine(commandLine) {
  if (!Array.isArray(commandLine)) throw 'commandLine should be an array'

  if (!commandLine.length) {
    console.log(chalk.redBright(`Please provide sasjs command.`))

    return
  }

  const command = new Command(commandLine.shift())
  const initialFlags = Object.keys(command.initialFlags)
  const commandValues = []
  const flagValues = []

  for (let i = 0; i < commandLine.length; i++) {
    if (/^-/.test(commandLine[i]) && command.flags) {
      let flag = commandLine[i].split('-').join('')
      const regExp = new RegExp(`^${flag}`)

      flag = initialFlags
        .filter((f) => regExp.test(f))
        .filter((f) =>
          command.flags.map((commandFlag) => commandFlag.name).includes(f)
        )[0]
      flag = command.flags.find((f) => f.name === flag)

      if (flag.withValue) {
        i++

        const value = commandLine[i]

        if (value) flagValues.push({ [flag.name]: value })
      } else {
        flagValues.push(flag.name)
      }
    } else {
      commandValues.push(commandLine[i])
    }
  }

  if (flagValues.length && commandValues.length) {
    return {
      commandValues,
      flagValues
    }
  } else if (!flagValues.length && !commandValues.length) return {}
  else if (!flagValues.length) return { commandValues }
  else return { flagValues }
}
