import { VersionCommand } from '../../../commands/version/versionCommand'
import { normaliseArgs, parse, requestedCommandName } from '../parse'

describe('parse', () => {
  it.each(['version', 'v', '-v', '--version'])(
    'resolves `sasjs %s` to the version command',
    (token: string) => {
      const command = parse(['node', 'sasjs', token])

      expect(command).toBeInstanceOf(VersionCommand)
      expect(command!.name).toEqual('version')
    }
  )

  it('leaves another command as it is', () => {
    const command = parse(['node', 'sasjs', 'help'])

    expect(command!.name).toEqual('help')
  })

  it('returns undefined for a command it does not register', () => {
    expect(parse(['node', 'sasjs', 'frobnicate'])).toBeUndefined()
  })

  it('returns undefined when no command is given', () => {
    expect(parse(['node', 'sasjs'])).toBeUndefined()
  })
})

describe('requestedCommandName', () => {
  it('reports the command as typed', () => {
    expect(requestedCommandName(['node', 'sasjs', 'frobnicate'])).toEqual(
      'frobnicate'
    )
  })

  it('reports the version command for a version flag', () => {
    expect(requestedCommandName(['node', 'sasjs', '--version'])).toEqual(
      'version'
    )
  })

  it('reports an empty name when there is no command', () => {
    expect(requestedCommandName(['node', 'sasjs'])).toEqual('')
  })
})

describe('normaliseArgs', () => {
  it.each(['-v', '--version'])(
    'rewrites %s in the command position',
    (flag) => {
      expect(normaliseArgs(['node', 'sasjs', flag])).toEqual([
        'node',
        'sasjs',
        'version'
      ])
    }
  )

  it('keeps the arguments that follow the flag', () => {
    expect(normaliseArgs(['node', 'sasjs', '--version', 'extra'])).toEqual([
      'node',
      'sasjs',
      'version',
      'extra'
    ])
  })

  it('does not rewrite a flag that is not in the command position', () => {
    const args = ['node', 'sasjs', 'run', 'program.sas', '-v']

    expect(normaliseArgs(args)).toEqual(args)
  })

  it('leaves the command name alone', () => {
    const args = ['node', 'sasjs', 'version']

    expect(normaliseArgs(args)).toEqual(args)
  })
})
