import { Logger, LogLevel } from '@sasjs/utils'

/**
 * The loader's contract, which is what this module owns: the engine is loaded
 * once, and a failure is not kept.
 *
 * The real loader cannot run here - jest's module runtime refuses to require an
 * ES module and the package publishes one - so the loader is injected. What the
 * engine then does with a buffer is the engine's own suite.
 *
 * The cache is module-level, so each case loads a fresh copy of the module:
 * without that, the second case would be handed the first case's engine and
 * would be testing the cache rather than the retry.
 */
const freshEngine = () => {
  let module: typeof import('../formatEngine')

  jest.isolateModules(() => {
    module = require('../formatEngine')
  })

  return module!.getFormatEngine
}

describe('getFormatEngine', () => {
  beforeEach(() => {
    process.logger = new Logger(LogLevel.Off)
    jest.restoreAllMocks()
  })

  it('loads once and returns the same promise afterwards', async () => {
    const engine = async (text: string) => text
    const load = jest.fn(async () => engine)
    const getFormatEngine = freshEngine()

    const first = getFormatEngine(load)
    const second = getFormatEngine(load)

    expect(second).toBe(first)
    await expect(first).resolves.toBe(engine)
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('retries after a failed load rather than keeping the rejection', async () => {
    // A transient failure - an upgrade replacing the package under a running
    // process - must not leave every later format in this process rule-only.
    const engine = async (text: string) => text
    const load = jest
      .fn()
      .mockRejectedValueOnce(new Error('module not found'))
      .mockResolvedValue(engine)
    const getFormatEngine = freshEngine()

    await expect(getFormatEngine(load)).rejects.toThrow('module not found')
    await expect(getFormatEngine(load)).resolves.toBe(engine)

    expect(load).toHaveBeenCalledTimes(2)
  })
})
