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
    'force'
  ])
])

export class Command {
  initialCommands = initialCommands
  initialFlags = initialFlags

  initialAliases = [
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

  commandFlags = [
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
      flags: [
        initialFlags.target,
        initialFlags.datafile,
        initialFlags.configfile
      ]
    },
    {
      command: initialCommands.job,
      flags: [initialFlags.target, initialFlags.wait, initialFlags.output]
    }
  ]

  constructor(name) {
    if (!name || typeof name !== 'string') throw 'Not valid command name!'

    this.name = Object.keys(this.initialCommands).includes(name)
      ? name
      : this.initialAliases.find((alias) => alias.aliases.includes(name)).name

    this.aliases = this.initialAliases.find((alias) => alias.name === this.name)
    this.aliases = this.aliases ? this.aliases.aliases : null

    this.flags = this.commandFlags.filter(
      (commandFlag) => commandFlag.command === this.name
    )
    this.flags = this.flags[0].flags.map((flag) => new Flag(flag))
  }
}

class Flag {
  flagsWithValue = [
    initialFlags.target,
    initialFlags.source,
    initialFlags.template,
    initialFlags.datafile,
    initialFlags.configfile
  ]

  constructor(name, isRequired = false) {
    if (!name || typeof name !== 'string') throw 'Not valid flag name!'

    this.name = name
    this.longSyntax = '--' + name
    this.shortSyntax = '-' + name[0]
    this.withValue = this.flagsWithValue.includes(name)
  }
}
