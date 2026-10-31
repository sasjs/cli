import { VersionCommand } from '../../../commands/version/versionCommand'
import { normaliseArgs, parse } from '../parse'

describe('parse', () => {
  it.each(['version', 'v', '-v', '--version'])(
    'resolves `sasjs %s` to the version command',
    (token: string) => {
      const command = parse(['node', 'sasjs', token])

      expect(command).toBeInstanceOf(VersionCommand)
      expect(command.name).toEqual('version')
    }
  )

  it('leaves another command as it is', () => {
    const command = parse(['node', 'sasjs', 'help'])

    expect(command.name).toEqual('help')
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
