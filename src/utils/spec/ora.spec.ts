import ora from '../ora'

/**
 * ora is an ES module, and so is its whole dependency tree, so jest needs every
 * package in `transformIgnorePatterns` to compile it. A new ora release that
 * pulls in another ESM-only dependency fails this suite at import time, which is
 * the signal that the transform list has gone stale.
 */
describe('ora', () => {
  it('returns a spinner with the API the CLI calls', () => {
    const spinner = ora('Loading')

    expect(typeof spinner.start).toBe('function')
    expect(typeof spinner.stop).toBe('function')
    expect(typeof spinner.succeed).toBe('function')
    expect(spinner.text).toBe('Loading')
  })

  it('starts and stops without a terminal attached', () => {
    const spinner = ora('Loading')

    spinner.start()
    spinner.stop()

    expect(spinner.isSpinning).toBe(false)
  })
})
