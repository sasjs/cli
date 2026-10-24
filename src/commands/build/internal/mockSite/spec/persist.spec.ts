export {}

/**
 * The page-side store: it owns the drive and asks the worker for snapshots. What
 * matters here is the ask/reply plumbing rather than IndexedDB itself - a
 * listener that outlives its request fires for a reply nobody reads, and a
 * timeout that reads like a snapshot empties the drive on download.
 */
const loadPersist = (options: { controller?: any } = {}) => {
  jest.resetModules()
  const posted: any[] = []
  const listeners: ((event: any) => void)[] = []
  const removed: ((event: any) => void)[] = []
  const controller =
    options.controller === undefined
      ? { postMessage: (message: any) => posted.push(message) }
      : options.controller

  const serviceWorker = {
    controller,
    // Never resolves: the boot sequence stops before it touches IndexedDB.
    ready: new Promise(() => {}),
    addEventListener: (type: string, fn: (event: any) => void) => {
      if (type === 'message') listeners.push(fn)
    },
    removeEventListener: (type: string, fn: (event: any) => void) => {
      if (type !== 'message') return
      removed.push(fn)
      const index = listeners.indexOf(fn)
      if (index >= 0) listeners.splice(index, 1)
    }
  }

  const window: any = {}
  ;(global as any).window = window
  ;(global as any).navigator = { serviceWorker }
  ;(global as any).indexedDB = {
    open: () => {
      throw new Error('the persist harness does not expect IndexedDB')
    }
  }

  require('../assets/persist.js')

  const reply = (data: any) => [...listeners].forEach((fn) => fn({ data }))

  return { window, listeners, removed, posted, reply }
}

describe('page-side store', () => {
  afterEach(() => {
    jest.useRealTimers()
    delete (global as any).window
    delete (global as any).navigator
    delete (global as any).indexedDB
  })

  it('asks the worker for a snapshot and drops the listener when it replies', async () => {
    const { window, listeners, removed, reply } = loadPersist()
    const before = listeners.length

    const pending = window.SASjsMock.snapshot()
    await Promise.resolve()

    reply({ type: 'sasjs-snapshot', files: { '/sasjs/drive/a.txt': 'a' } })

    await expect(pending).resolves.toEqual({
      type: 'sasjs-snapshot',
      files: { '/sasjs/drive/a.txt': 'a' }
    })
    expect(removed).toHaveLength(1)
    expect(listeners.length).toBe(before)
  })

  it('reports a timeout as an error and leaves no listener behind', async () => {
    jest.useFakeTimers()
    const { window, listeners, reply } = loadPersist()
    const before = listeners.length

    const pending = window.SASjsMock.snapshot()
    await jest.advanceTimersByTimeAsync(20000)

    await expect(pending).resolves.toEqual({
      error: 'timed out waiting for sasjs-snapshot'
    })
    expect(listeners.length).toBe(before)

    // a reply that arrives after the timeout goes nowhere: the listener is gone
    reply({ type: 'sasjs-snapshot', files: { late: 'x' } })
    await expect(pending).resolves.toEqual({
      error: 'timed out waiting for sasjs-snapshot'
    })
    expect(listeners.length).toBe(before)
  })

  it('reports a missing controller as an error', async () => {
    jest.useFakeTimers()
    const { window, listeners } = loadPersist({ controller: null })
    const before = listeners.length

    const pending = window.SASjsMock.snapshot()
    await jest.advanceTimersByTimeAsync(11000)

    await expect(pending).resolves.toEqual({
      error: 'no service worker controller'
    })
    expect(listeners.length).toBe(before)
  })
})
