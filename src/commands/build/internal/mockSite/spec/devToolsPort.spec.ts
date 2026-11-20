import path from 'path'
import { waitForDevToolsPort } from './devToolsPort.cjs'

const profile = path.join('/tmp', 'browser-profile')
const portFile = path.join(profile, 'DevToolsActivePort')
const chromium = { exitCode: null }

function clock() {
  let time = 0
  return {
    now: () => time,
    sleep: async (ms: number) => {
      time += ms
    }
  }
}

describe('waitForDevToolsPort', () => {
  it('accepts a valid port after the old 10 second deadline', async () => {
    const timer = clock()
    const readFile = async (file: string) => {
      expect(file).toBe(portFile)
      if (timer.now() < 11000) {
        throw Object.assign(new Error('missing'), { code: 'ENOENT' })
      }
      return '9222\n/devtools/browser/example\n'
    }
    await expect(
      waitForDevToolsPort(profile, chromium, () => null, undefined, {
        ...timer,
        readFile
      })
    ).resolves.toBe(9222)
    expect(timer.now()).toBe(11000)
  })

  it('uses the default polling delay when the port is initially missing', async () => {
    let reads = 0
    const port = await waitForDevToolsPort(
      profile,
      chromium,
      () => null,
      undefined,
      {
        readFile: async () => {
          if (++reads === 1) throw new Error('not ready')
          return '9222\n'
        }
      }
    )
    expect(port).toBe(9222)
    expect(reads).toBe(2)
  })

  it('rejects invalid and late ports and reports stderr', async () => {
    const timer = clock()
    let reads = 0
    await expect(
      waitForDevToolsPort(
        profile,
        chromium,
        () => null,
        () => 'browser error',
        {
          ...timer,
          readFile: async () => {
            if (++reads === 1) return '0\n'
            await timer.sleep(30000)
            return '9222\n'
          }
        }
      )
    ).rejects.toThrow(
      /timed out after 30000ms.*invalid or late port.*browser error/
    )
    expect(reads).toBe(2)
  })

  it('reports a missing port without a stderr callback', async () => {
    const timer = clock()
    await expect(
      waitForDevToolsPort(profile, chromium, () => null, undefined, {
        ...timer,
        readFile: async () => {
          throw Object.assign(new Error('port file missing'), {
            code: 'ENOENT'
          })
        }
      })
    ).rejects.toThrow(/ENOENT: port file missing; Chromium stderr: \(empty\)/)
    expect(timer.now()).toBe(30000)
  })

  it('reports a browser terminated by a signal without waiting for a port', async () => {
    const timer = clock()
    const readFile = jest.fn(async () => '9222\n')
    await expect(
      waitForDevToolsPort(
        profile,
        { exitCode: null, signalCode: 'SIGTERM' },
        () => null,
        () => 'terminated',
        { ...timer, readFile }
      )
    ).rejects.toThrow('Chromium exited: terminated')
    expect(readFile).not.toHaveBeenCalled()
  })

  it('propagates spawn errors and reports browser exit without stderr', async () => {
    const spawnError = new Error('spawn failed')
    await expect(
      waitForDevToolsPort(profile, chromium, () => spawnError)
    ).rejects.toBe(spawnError)
    await expect(
      waitForDevToolsPort(profile, { exitCode: 1 }, () => null)
    ).rejects.toThrow('Chromium exited:')
  })
})
