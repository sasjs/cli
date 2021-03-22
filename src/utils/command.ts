import { displayError } from './displayResult'
import { arrToObj, checkNodeVersion } from './utils'

const showInvalidCommandMessage = () => {
  displayError(
    {},
    `Invalid command. Run 'sasjs help' to get the list of valid commands.`
  )
}

const showInvalidFlagMessage = (
  flagMessage: string,
  supportedFlags: string[]
) => {
  displayError(
    {},
    `${flagMessage}${
      supportedFlags
        ? ` Supported flags are:\n${supportedFlags.join('\n')}`
        : ''
    }`
  )
}

const initialCommands = arrToObj([
  ...new Set([
    'init',
    'create',
    'doc',
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
    'job',
    'flow',
    'version'
  ])
])

const initialFlags = arrToObj([
  ...new Set([
    'target',
    'source',
    'template',
    'datafile',
    'configfile',
    'wait',
    'output',
    'force',
    'logFile',
    'status',
    'logFolder',
    'csvFile',
    'returnStatusOnly',
    'ignoreWarnings',
    'outDirectory',
    'insecure',
    'compile'
  ])
])

const initialAliases = [
  { name: initialCommands.doc, aliases: ['docs'] },
  { name: initialCommands['build-DB'], aliases: ['db'] },
  { name: initialCommands.compile, aliases: ['c'] },
  { name: initialCommands.build, aliases: ['b'] },
  { name: initialCommands.compilebuild, aliases: ['cb'] },
  { name: initialCommands.deploy, aliases: ['d'] },
  { name: initialCommands.compilebuilddeploy, aliases: ['cbd'] },
  { name: initialCommands.web, aliases: ['w'] },
  { name: initialCommands.add, aliases: ['a'] },
  { name: initialCommands.run, aliases: ['r'] },
  { name: initialCommands.request, aliases: ['rq'] },
  { name: initialCommands.version, aliases: ['v', '-v', '--version'] }
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
  {
    command: initialCommands.add,
    flags: [initialFlags.target, initialFlags.insecure]
  },
  { command: initialCommands.create, flags: [initialFlags.template] },
  {
    command: initialCommands.doc,
    flags: [initialFlags.target, initialFlags.outDirectory]
  },
  { command: initialCommands.web, flags: [initialFlags.target] },
  { command: initialCommands['build-DB'], flags: [initialFlags.target] },
  {
    command: initialCommands.compile,
    flags: [initialFlags.target, initialFlags.source, initialFlags.output]
  },
  { command: initialCommands.build, flags: [initialFlags.target] },
  { command: initialCommands.compilebuild, flags: [initialFlags.target] },
  { command: initialCommands.deploy, flags: [initialFlags.target] },
  {
    command: initialCommands.compilebuilddeploy,
    flags: [initialFlags.target, initialFlags.force]
  },
  {
    command: initialCommands.servicepack,
    flags: [initialFlags.target, initialFlags.source, initialFlags.force]
  },
  {
    command: initialCommands.run,
    flags: [initialFlags.target, initialFlags.compile]
  },
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
      initialFlags.logFile,
      initialFlags.status,
      initialFlags.returnStatusOnly,
      initialFlags.ignoreWarnings
    ]
  },
  {
    command: initialCommands.flow,
    flags: [
      initialFlags.target,
      initialFlags.source,
      initialFlags.logFolder,
      initialFlags.csvFile
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
  initialFlags.logFile,
  initialFlags.status,
  initialFlags.csvFile,
  initialFlags.logFolder,
  initialFlags.outDirectory
]

export class Command {
  values: string[] = []
  flags: Flag[] = []
  aliases: string[] = []
  supportedFlags: string[] = []
  name: string = ''

  constructor(commandLine: string | string[]) {
    if (typeof commandLine === 'string')
      commandLine = commandLine.replace(/\s\s+/g, ' ').split(' ')

    if (!Array.isArray(commandLine)) {
      showInvalidCommandMessage()

      return
    }

    const command = commandLine.shift() as string

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

    const aliases = initialAliases.find((alias) => alias.name === this.name)
    this.aliases = aliases ? aliases.aliases : []

    const supportedFlags = commandFlags.filter(
      (flag) => flag.command === this.name
    )[0]

    if (supportedFlags) this.supportedFlags = supportedFlags.flags

    for (let i = 0; i < commandLine.length; i++) {
      if (/^-/.test(commandLine[i]) && this.supportedFlags) {
        let flagString = commandLine[i].split('-').join('')
        const regExp = new RegExp(`^${flagString}`)

        flagString = Object.keys(initialFlags)
          .filter((f) => regExp.test(f))
          .filter((f) => this.supportedFlags.includes(f))[0]

        try {
          const flag = new Flag(flagString)

          this.flags.push(flag)

          if (flag.withValue) {
            if (/^-/.test(commandLine[i + 1])) continue

            i++

            const value = commandLine[i]

            if (value && this.flags.find((f) => f.name === flag.name)) {
              this.flags.find((f) => f.name === flag.name)!.setValue(value)
            }
          }
        } catch (error) {
          showInvalidFlagMessage(error, this.supportedFlags)
        }
      } else {
        this.values.push(commandLine[i])
      }
    }
  }

  getSubCommand() {
    return this.values.shift() || ''
  }

  getFlag(flagName: string) {
    return this.flags.find((flag) => flag.name === flagName)
  }

  getFlagValue(flagName: string): string | boolean | undefined {
    const flag = this.getFlag(flagName)

    if (!flag) return undefined
    if (!flag.withValue) return true

    return flag.value
  }

  prefixAppLoc(appLoc = '', path = '') {
    if (!path) return null

    if (!/^\//.test(appLoc)) appLoc = '/' + appLoc

    if (Array.isArray(path)) path = path.join(' ')

    return path
      .split(' ')
      .map((p) => (/^\//.test(p) ? p : `${appLoc}/${p}`))
      .join(' ')
  }

  getTargetWithoutFlag() {
    const deprecationDate = new Date(2021, 10, 2)
    const today = new Date()

    if (today < deprecationDate && this.values.length) {
      process.logger?.warn(
        `Please use --target or -t flag to specify the target name. Specifying the target name without a flag will not be supported starting from November 1, 2021.`
      )

      return this.values.shift()
    }

    return undefined
  }

  getAllSupportedCommands() {
    return Object.keys(initialCommands)
  }

  getAllSupportedAliases() {
    return initialAliases.map((alias) => alias.name)
  }
}

class Flag {
  value: string | undefined
  name: string
  longSyntax: string
  shortSyntax: string
  withValue = false
  constructor(name: string) {
    if (!name || typeof name !== 'string') throw `Not valid flag name!`

    this.name = name
    this.longSyntax = '--' + name
    this.shortSyntax = '-' + name[0]
    this.withValue = flagsWithValue.includes(name)
  }

  setValue(value: string) {
    this.value = value
  }
}

export function isWindows(): boolean {
  return process.platform === 'win32'
}

export function parseCommand(rawArgs: string[]) {
  checkNodeVersion()

  const isWin = isWindows()
  const isMSys = !!process.env.MSYSTEM
  const prefix = process.env.EXEPATH
    ? process.env.EXEPATH.replace(/\\/g, '/')
    : ''
  const homedir = require('os').homedir()

  const argsTemp =
    isWin && isMSys
      ? rawArgs.slice(2).map((arg) => arg.replace(prefix, ''))
      : rawArgs.slice(2)

  const args = argsTemp.map((arg) =>
    arg.replace('~', homedir.replace(/\\/g, '/'))
  )

  if (args.length) {
    const name = getUnaliasedCommand(args[0])

    return { name, parameters: args }
  }
  return null
}

function getUnaliasedCommand(command: string) {
  if (
    command === 'version' ||
    command === '--version' ||
    command === '-version' ||
    command === '-v' ||
    command === '--v' ||
    command === 'v'
  ) {
    return 'version'
  }

  if (
    command === 'help' ||
    command === '--help' ||
    command === '-help' ||
    command === '-h' ||
    command === '--h' ||
    command === 'h'
  ) {
    return 'help'
  }

  if (command === 'create') {
    return 'create'
  }

  if (command === 'doc' || command === 'docs') {
    return 'doc'
  }

  if (command === 'compile' || command === 'c') {
    return 'compile'
  }

  if (command === 'build' || command === 'b') {
    return 'build'
  }

  if (command === 'deploy' || command === 'd') {
    return 'deploy'
  }

  if (command === 'servicepack') {
    return 'servicepack'
  }

  if (command === 'build-DB' || command === 'DB' || command === 'db') {
    return 'db'
  }

  if (command === 'compilebuild' || command === 'cb') {
    return 'compilebuild'
  }

  if (command === 'cbd') {
    return 'compilebuilddeploy'
  }
  if (command === 'web' || command === 'w') {
    return 'web'
  }

  if (command === 'add' || command === 'a') {
    return 'add'
  }

  if (command === 'run' || command === 'r') {
    return 'run'
  }

  if (command === 'request' || command === 'rq') {
    return 'request'
  }

  if (command === 'context') return 'context'

  if (command === 'folder') return 'folder'

  return command
}
