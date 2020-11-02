import { displayResult } from './displayResult'

const showInvalidCommandMessage = () => {
  displayResult(
    {},
    `Invalid command. Run 'sasjs help' to get the list of valid commands.`
  )
}
const arrToObj = (arr) => arr.reduce((o, key) => ({ ...o, [key]: key }), {})

const initialCommands = arrToObj([
  ...new Set([
    'create',
    'web',
    'build-DB',
    'compile',
    'build',
    'compilebuild',
    'deploy',
    'compilebuilddeploy',
    'servicepack',
    'context',
    'add',
    'run',
    'request',
    'folder',
    'job'
  ])
])

const initialFlags = arrToObj([
  ...new Set([
    'target',
    'source',
    'template',
    'source',
    'datafile',
    'configfile',
    'wait',
    'output',
    'force',
    'log'
  ])
])

const initialAliases = [
  { name: initialCommands['build-DB'], aliases: ['db'] },
  { name: initialCommands.compile, aliases: ['c'] },
  { name: initialCommands.build, aliases: ['b'] },
  { name: initialCommands.compilebuild, aliases: ['cb'] },
  { name: initialCommands.deploy, aliases: ['d'] },
  { name: initialCommands.compilebuilddeploy, aliases: ['cbd'] },
  { name: initialCommands.web, aliases: ['w'] },
  { name: initialCommands.add, aliases: ['a'] },
  { name: initialCommands.run, aliases: ['r'] },
  { name: initialCommands.request, aliases: ['rq'] }
]

const commandFlags = [
  {
    command: initialCommands.folder,
    flags: [initialFlags.target, initialFlags.force]
  },
  {
    command: initialCommands.context,
    flags: [initialFlags.target, initialFlags.source]
  },
  { command: initialCommands.create, flags: [initialFlags.template] },
  { command: initialCommands.web, flags: [initialFlags.target] },
  { command: initialCommands['build-DB'], flags: [initialFlags.target] },
  { command: initialCommands.compile, flags: [initialFlags.target] },
  { command: initialCommands.build, flags: [initialFlags.target] },
  { command: initialCommands.compilebuild, flags: [initialFlags.target] },
  { command: initialCommands.deploy, flags: [initialFlags.target] },
  {
    command: initialCommands.compilebuilddeploy,
    flags: [initialFlags.target]
  },
  {
    command: initialCommands.servicepack,
    flags: [initialFlags.target, initialFlags.source]
  },
  { command: initialCommands.run, flags: [initialFlags.target] },
  {
    command: initialCommands.request,
    flags: [initialFlags.target, initialFlags.datafile, initialFlags.configfile]
  },
  {
    command: initialCommands.job,
    flags: [
      initialFlags.target,
      initialFlags.wait,
      initialFlags.output,
      initialFlags.log
    ]
  }
]

const flagsWithValue = [
  initialFlags.target,
  initialFlags.source,
  initialFlags.template,
  initialFlags.datafile,
  initialFlags.configfile,
  initialFlags.output,
  initialFlags.log
]

export class Command {
  values = []
  flags = []

  constructor(commandLine) {
    if (typeof commandLine === 'string')
      commandLine = commandLine.replace(/\s\s+/g, ' ').split(' ')

    if (!Array.isArray(commandLine)) {
      showInvalidCommandMessage()

      return
    }

    const command = commandLine.shift()

    if (Object.keys(initialCommands).includes(command)) {
      this.name = command
    } else {
      const alias = initialAliases.find((alias) =>
        alias.aliases.includes(command)
      )

      if (alias) this.name = alias.name
    }

    if (!this.name) {
      showInvalidCommandMessage()

      return
    }

    this.aliases = initialAliases.find((alias) => alias.name === this.name)
    this.aliases = this.aliases ? this.aliases.aliases : null

    this.supportedFlags = commandFlags.filter(
      (commandFlag) => commandFlag.command === this.name
    )[0].flags

    for (let i = 0; i < commandLine.length; i++) {
      if (/^-/.test(commandLine[i]) && this.supportedFlags) {
        let flag = commandLine[i].split('-').join('')
        const regExp = new RegExp(`^${flag}`)

        flag = Object.keys(initialFlags)
          .filter((f) => regExp.test(f))
          .filter((f) => this.supportedFlags.includes(f))[0]

        flag = new Flag(flag)

        this.flags.push(flag)

        if (flag.withValue) {
          if (/^-/.test(commandLine[i + 1])) continue

          i++

          const value = commandLine[i]

          if (value) {
            this.flags.find((f) => f.name === flag.name).setValue(value)
          }
        }
      } else {
        this.values.push(commandLine[i])
      }
    }
  }
}

class Flag {
  value = null

  constructor(name) {
    if (!name || typeof name !== 'string') throw 'Not valid flag name!'

    this.name = name
    this.longSyntax = '--' + name
    this.shortSyntax = '-' + name[0]
    this.withValue = flagsWithValue.includes(name)
  }

  setValue(value) {
    this.value = value
  }
}
