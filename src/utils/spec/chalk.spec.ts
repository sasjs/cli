import chalk from '../chalk'

/**
 * chalk is an ES module loaded through `require`, and jest needs the package in
 * `transformIgnorePatterns` to compile it. Without that entry - or when a new
 * dependency of chalk is ESM-only - this suite fails to load at all, which is
 * the signal that the transform list has gone stale.
 */
describe('chalk', () => {
  it('is the singleton Chalk instance rather than a module namespace', () => {
    expect(typeof chalk).toBe('function')
    expect(typeof chalk.bold).toBe('function')
    expect(typeof chalk.red.bold).toBe('function')
  })

  it('applies styles at a colour level it is given', () => {
    const level = chalk.level
    chalk.level = 1

    try {
      expect(chalk.bold('bold')).toBe('\u001B[1mbold\u001B[22m')
      expect(chalk.green('ok')).toBe('\u001B[32mok\u001B[39m')
    } finally {
      chalk.level = level
    }
  })
})
