export {}

/**
 * The page-side store: it owns the drive and asks the worker for snapshots. What
 * matters here is the ask/reply plumbing and the IndexedDB round trip - a
 * listener that outlives its request fires for a reply nobody reads, and a
 * timeout that reads like a snapshot empties the drive on download.
 */

/** Enough of IndexedDB to exercise the store: one store, no indexes. */
const createIndexedDB = () => {
  const rows = new Map<string, any>()
  const data = () => rows

  const request = (run: () => any) => {
    const req: any = { result: undefined, onsuccess: null, onerror: null }
    setTimeout(() => {
      try {
        req.result = run()
        if (req.onsuccess) req.onsuccess()
      } catch (e) {
        if (req.onerror) req.onerror()
      }
    }, 0)
    return req
  }

  const objectStore = {
    put: (value: any, key: string) => {
      data().set(key, value)
    },
    delete: (key: string) => {
      data().delete(key)
    },
    clear: () => data().clear(),
    get: (key: string) => request(() => data().get(key)),
    getAllKeys: () => request(() => [...data().keys()]),
    getAll: () => request(() => [...data().values()])
  }

  const db: any = {
    objectStoreNames: { contains: () => true },
    createObjectStore: () => objectStore,
    transaction: (_store: string, _mode: string) => {
      const tx: any = {
        oncomplete: null,
        onerror: null,
        onabort: null,
        objectStore: () => objectStore
      }
      setTimeout(() => tx.oncomplete && tx.oncomplete(), 0)
      return tx
    }
  }

  const open = () => {
    const req: any = {
      result: db,
      onsuccess: null,
      onerror: null,
      onupgradeneeded: null
    }
    setTimeout(() => {
      if (req.onupgradeneeded) req.onupgradeneeded()
      if (req.onsuccess) req.onsuccess()
    }, 0)
    return req
  }

  return { open, rows }
}

const loadPersist = (
  options: {
    controller?: any
    ready?: Promise<any>
    seeded?: any
    /** The stamp the stored drive was written by; omitted means "none kept". */
    storedStamp?: string
    /** The stamp this build publishes; omitted means a site with no stamp. */
    buildStamp?: string
    /** Set to make localStorage throw, as a browser that refuses storage does. */
    storageUnavailable?: boolean
    /** Where the worker sits, for a site published from a folder. */
    scriptURL?: string
    /** The page's own URL, as the browser reports it. */
    baseURI?: string
    /**
     * The identity row the page stored: the fixture the worker reported and the
     * subject the visitor chose.
     */
    seededIdentity?: { fixture: any; subject?: string | null }
  } = {}
) => {
  jest.resetModules()
  const posted: any[] = []
  const listeners: ((event: any) => void)[] = []
  const removed: ((event: any) => void)[] = []
  const controller =
    options.controller === undefined
      ? { postMessage: (message: any) => posted.push(message) }
      : options.controller
  // a real controller names the site folder, which is how the page finds the
  // config file; every case gets one unless it is testing that it is missing
  if (controller && !controller.scriptURL)
    controller.scriptURL = options.scriptURL || 'https://host.test/sw.js'

  const serviceWorker = {
    controller,
    // Never resolves by default: the boot sequence then stops before it touches
    // IndexedDB, leaving the ask/reply tests to drive it directly.
    ready: options.ready || new Promise(() => {}),
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

  // the page reads its build stamp and what the stored drive was written by
  const local = new Map<string, string>()
  if (options.storedStamp !== undefined)
    local.set('sasjs-mock-build', options.storedStamp)
  ;(global as any).localStorage = options.storageUnavailable
    ? {
        getItem: () => {
          throw new Error('storage is denied')
        },
        setItem: () => {
          throw new Error('storage is denied')
        }
      }
    : {
        getItem: (key: string) => (local.has(key) ? local.get(key) : null),
        setItem: (key: string, value: string) => local.set(key, value)
      }
  // the page URL, which a folder site must NOT be used to resolve the config
  ;(global as any).document = {
    baseURI: options.baseURI || 'https://host.test/'
  }
  ;(global as any).fetch = jest.fn(async (url: string) => ({
    ok: true,
    json: async () => ({ buildStamp: options.buildStamp || '' })
  }))

  const idb = (() => {
    const fake = createIndexedDB()
    Object.entries(options.seeded || {}).forEach(([key, value]) =>
      fake.rows.set(key, value)
    )
    // the identity row lives beside the drive, under its own key
    if (options.seededIdentity) fake.rows.set('current', options.seededIdentity)
    return fake
  })()
  ;(global as any).indexedDB = idb

  require('../assets/persist.js')

  const reply = (data: any) => [...listeners].forEach((fn) => fn({ data }))

  return {
    window,
    listeners,
    removed,
    posted,
    reply,
    rows: idb.rows,
    stored: local
  }
}

describe('page-side store', () => {
  afterEach(() => {
    jest.useRealTimers()
    delete (global as any).window
    delete (global as any).navigator
    delete (global as any).indexedDB
    delete (global as any).document
    delete (global as any).localStorage
    delete (global as any).fetch
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

  it('writes, reads back and clears the drive', async () => {
    const { window } = loadPersist()

    await expect(
      window.SASjsMock.writeFiles({ '/sasjs/drive/a.txt': 'a' })
    ).resolves.toEqual({ written: 1, deleted: 0 })
    await expect(window.SASjsMock.readAll()).resolves.toEqual({
      '/sasjs/drive/a.txt': 'a'
    })

    await expect(
      window.SASjsMock.writeFiles({ '/sasjs/drive/a.txt': null })
    ).resolves.toEqual({ written: 0, deleted: 1 })
    await expect(window.SASjsMock.readAll()).resolves.toEqual({})

    await window.SASjsMock.writeFiles({ '/sasjs/drive/b.txt': 'bb' })
    await expect(window.SASjsMock.readAll()).resolves.toEqual({
      '/sasjs/drive/b.txt': 'bb'
    })
    await window.SASjsMock.clear()
    await expect(window.SASjsMock.readAll()).resolves.toEqual({})
  })

  it('takes the drive total from the worker, which owns the storage format', async () => {
    const { window, posted, reply } = loadPersist()

    const pending = window.SASjsMock.stats()
    await Promise.resolve()
    expect(posted).toContainEqual({ type: 'sasjs-stats' })

    // the worker measures a byte entry as its bytes, not as base64
    reply({ type: 'sasjs-stats', boot: {}, stats: { files: 2, bytes: 7 } })

    await expect(pending).resolves.toEqual({ files: 2, bytes: 7 })
  })

  it('fails the read when the worker cannot report, rather than returning NaN', async () => {
    jest.useFakeTimers()
    const { window } = loadPersist()

    // the assertion is attached before the timer fires: a rejection with no
    // handler yet is an unhandled rejection, not a test result
    const pending = expect(window.SASjsMock.stats()).rejects.toThrow(
      'timed out waiting for sasjs-stats'
    )
    await jest.advanceTimersByTimeAsync(20000)

    await pending
  })

  it('fails the read when the reply carries no stats', async () => {
    const { window, reply } = loadPersist()

    const pending = expect(window.SASjsMock.stats()).rejects.toThrow(
      'carried no stats'
    )
    await Promise.resolve()
    // a worker left over from an older build answers the message with no stats
    reply({ type: 'sasjs-stats' })

    await pending
  })

  it('writes nothing when a change set is empty', async () => {
    const { window } = loadPersist()

    await expect(window.SASjsMock.writeFiles({})).resolves.toEqual({
      written: 0,
      deleted: 0
    })
    await expect(window.SASjsMock.writeFiles(undefined)).resolves.toEqual({
      written: 0,
      deleted: 0
    })
  })

  it('persists the files the worker reports as changed', async () => {
    const { window, reply, rows } = loadPersist()

    reply({ type: 'sasjs-persist', files: { '/sasjs/drive/c.txt': 'ccc' } })
    await new Promise((r) => setTimeout(r, 20))

    expect(rows.get('/sasjs/drive/c.txt')).toBe('ccc')
  })

  it('resets the worker and the stored drive together', async () => {
    const { window, posted, reply, rows } = loadPersist({
      seeded: { '/sasjs/drive/old.txt': 'old' }
    })

    const pending = window.SASjsMock.reset()
    await Promise.resolve()
    expect(posted.some((m) => m.type === 'sasjs-reset')).toBe(true)

    reply({ type: 'sasjs-reset-ack' })
    await expect(pending).resolves.toBe(true)
    expect(rows.has('/sasjs/drive/old.txt')).toBe(false)
  })

  it('hands a stored drive to the worker at boot', async () => {
    const controller = { postMessage: jest.fn() }
    const { window, listeners } = loadPersist({
      controller,
      ready: Promise.resolve({}),
      seeded: { '/sasjs/drive/stored.txt': 'stored' }
    })

    const answering = setInterval(() => {
      const asked = controller.postMessage.mock.calls
      if (!asked.length) return
      const type = asked[0][0].type
      ;[...listeners].forEach((fn) =>
        fn({ data: { type: type + '-ack', booted: true } })
      )
    }, 5)

    const info = await window.__sasjsMockReady
    clearInterval(answering)

    expect(controller.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'sasjs-load',
        files: { '/sasjs/drive/stored.txt': 'stored' }
      })
    )
    expect(info).toEqual({ type: 'sasjs-load-ack', booted: true })
  })

  it('asks for a seed at boot when nothing is stored', async () => {
    const controller = { postMessage: jest.fn() }
    const { window, listeners } = loadPersist({
      controller,
      ready: Promise.resolve({})
    })

    const answering = setInterval(() => {
      const asked = controller.postMessage.mock.calls
      if (!asked.length) return
      const type = asked[0][0].type
      ;[...listeners].forEach((fn) => fn({ data: { type: type + '-ack' } }))
    }, 5)

    await window.__sasjsMockReady
    clearInterval(answering)

    expect(controller.postMessage).toHaveBeenCalledWith({
      type: 'sasjs-seed',
      files: {},
      identity: undefined,
      subject: undefined
    })
  })

  /**
   * Answers whatever the page asks, so a boot test can assert on which question
   * was asked rather than on the reply.
   */
  const answerBoot = (controller: any, listeners: ((event: any) => void)[]) => {
    const answering = setInterval(() => {
      const asked = controller.postMessage.mock.calls
      if (!asked.length) return
      const type = asked[0][0].type
      ;[...listeners].forEach((fn) => fn({ data: { type: type + '-ack' } }))
    }, 5)
    return () => clearInterval(answering)
  }

  it("drops a drive written by another build and takes this build's seed", async () => {
    // the drive outlives the build that wrote it, so a returning visitor kept
    // running the previous build's services - the ones this build no longer
    // matches. A stamp on the seed, kept beside the drive, is what tells the two
    // apart.
    const controller = { postMessage: jest.fn() }
    const { window, listeners, stored, rows } = loadPersist({
      controller,
      ready: Promise.resolve({}),
      seeded: { '/sasjs/drive/stored.txt': 'stored' },
      buildStamp: 'build-b',
      storedStamp: 'build-a'
    })

    const stop = answerBoot(controller, listeners)
    await window.__sasjsMockReady
    stop()

    expect(controller.postMessage).toHaveBeenCalledWith({
      type: 'sasjs-seed',
      files: {},
      identity: undefined,
      subject: undefined
    })
    expect(stored.get('sasjs-mock-build')).toBe('build-b')
    // the old drive is gone rather than merged with the new seed
    expect(rows.size).toBe(0)
  })

  it('seeds over a drive from a build before the stamp existed', async () => {
    // no stamp is the same answer as a different one: the drive predates the
    // build that would have written it, so nothing says which services are in it
    const controller = { postMessage: jest.fn() }
    const { window, listeners } = loadPersist({
      controller,
      ready: Promise.resolve({}),
      seeded: { '/sasjs/drive/stored.txt': 'stored' },
      buildStamp: 'build-b'
    })

    const stop = answerBoot(controller, listeners)
    await window.__sasjsMockReady
    stop()

    expect(controller.postMessage).toHaveBeenCalledWith({
      type: 'sasjs-seed',
      files: {},
      identity: undefined,
      subject: undefined
    })
  })

  it('keeps a drive this build wrote', async () => {
    const controller = { postMessage: jest.fn() }
    const { window, listeners } = loadPersist({
      controller,
      ready: Promise.resolve({}),
      seeded: { '/sasjs/drive/stored.txt': 'stored' },
      buildStamp: 'build-b',
      storedStamp: 'build-b'
    })

    const stop = answerBoot(controller, listeners)
    await window.__sasjsMockReady
    stop()

    expect(controller.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'sasjs-load' })
    )
  })

  it('keeps the drive when the site publishes no stamp', async () => {
    // a site built before stamps keeps the behaviour it had: its drives are its
    // own business
    const controller = { postMessage: jest.fn() }
    const { window, listeners } = loadPersist({
      controller,
      ready: Promise.resolve({}),
      seeded: { '/sasjs/drive/stored.txt': 'stored' }
    })

    const stop = answerBoot(controller, listeners)
    await window.__sasjsMockReady
    stop()

    expect(controller.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'sasjs-load' })
    )
  })

  it('keeps the drive when storage is refused, instead of seeding every load', async () => {
    // a browser that denies localStorage cannot remember which build wrote the
    // drive, and must not read that as "another build" on every visit
    const controller = { postMessage: jest.fn() }
    const { window, listeners } = loadPersist({
      controller,
      ready: Promise.resolve({}),
      seeded: { '/sasjs/drive/stored.txt': 'stored' },
      buildStamp: 'build-b',
      storageUnavailable: true
    })

    const stop = answerBoot(controller, listeners)
    await window.__sasjsMockReady
    stop()

    expect(controller.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'sasjs-load' })
    )
  })

  it('reads the config from the folder the worker sits in, not the page URL', async () => {
    // a site published from a folder: a page reached at /demo (no trailing
    // slash) has a baseURI of https://host/demo, which resolves host/... one
    // level too high - and the fetch 404s, so the re-seed never happens. The
    // worker's own URL is the definition of the site folder.
    const controller = { postMessage: jest.fn() }
    const { window, listeners } = loadPersist({
      controller,
      ready: Promise.resolve({}),
      seeded: { '/sasjs/drive/stored.txt': 'stored' },
      buildStamp: 'build-b',
      storedStamp: 'build-a',
      scriptURL: 'https://host.test/demo/sw.js',
      baseURI: 'https://host.test/demo'
    })

    const stop = answerBoot(controller, listeners)
    await window.__sasjsMockReady
    stop()

    const [url, init] = (global as any).fetch.mock.calls[0]
    expect(String(url)).toBe('https://host.test/demo/host/mock-config.json')
    expect(init).toEqual({ cache: 'no-store' })
    // and the stamp it read is acted on
    expect(controller.postMessage).toHaveBeenCalledWith({
      type: 'sasjs-seed',
      files: {},
      identity: undefined,
      subject: undefined
    })
  })

  /**
   * The fixture a stored identity carries. The page never reads inside it - the
   * worker parses it - so this only has to be the object that was stored.
   */
  const FIXTURE = {
    format: 1,
    users: [{ username: 'sasjsadmin' }, { username: 'sasjsuser' }],
    groups: [],
    permissions: [],
    clients: [{ clientId: 'web_app' }]
  }

  /**
   * Answers every question the page has asked, once each.
   *
   * The page asks the worker more than one thing at boot (a seed or a load, and
   * whatever a caller asked for next), and the order is not fixed: both go
   * through `waitForController`. Answering "the last call" therefore answers the
   * wrong one as often as the right one.
   */
  const answerAll = (
    controller: any,
    listeners: ((event: any) => void)[],
    payload: (index: number, type: string) => any
  ) => {
    const answered = new Set<number>()
    const answering = setInterval(() => {
      controller.postMessage.mock.calls.forEach(
        ([message]: any[], index: number) => {
          if (answered.has(index)) return
          answered.add(index)
          ;[...listeners].forEach((fn) =>
            fn({
              data: {
                type: message.type + '-ack',
                ...payload(index, message.type)
              }
            })
          )
        }
      )
    }, 5)
    return () => clearInterval(answering)
  }

  it('hands a stored fixture and subject to the worker at boot', async () => {
    const controller = { postMessage: jest.fn() }
    const { window, listeners } = loadPersist({
      controller,
      ready: Promise.resolve({}),
      seeded: { '/sasjs/drive/stored.txt': 'stored' },
      seededIdentity: { fixture: FIXTURE, subject: 'sasjsuser' }
    })

    const stop = answerBoot(controller, listeners)
    await window.__sasjsMockReady
    stop()

    expect(controller.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'sasjs-load',
        identity: FIXTURE,
        subject: 'sasjsuser'
      })
    )
  })

  it('stores the fixture the worker reports when a route changed it', async () => {
    const controller = { postMessage: jest.fn() }
    const { reply, rows } = loadPersist({ controller })

    reply({ type: 'sasjs-persist', files: {}, identity: FIXTURE })
    await new Promise((resolve) => setTimeout(resolve, 5))

    expect(rows.get('current')).toEqual({
      fixture: FIXTURE,
      subject: undefined
    })
  })

  it('drops a stored fixture this build cannot read, and boots from its own', async () => {
    // a store written by an older build is refused by the worker BY NAME; the
    // page then boots from the fixture the site ships rather than waiting out a
    // boot that never answers
    const controller = { postMessage: jest.fn() }
    const { window, listeners, rows } = loadPersist({
      controller,
      ready: Promise.resolve({}),
      seeded: { '/sasjs/drive/stored.txt': 'stored' },
      seededIdentity: { fixture: { ...FIXTURE, format: 0 }, subject: null }
    })

    const stop = answerAll(controller, listeners, (index) =>
      index === 0
        ? { error: 'The identity fixture states format 0.' }
        : { booted: true }
    )

    const boot = await window.__sasjsMockReady
    stop()

    expect(boot).toEqual({ type: 'sasjs-load-ack', booted: true })
    // the retry carries the drive, and none of the fixture it could not read
    expect(controller.postMessage.mock.calls[1][0]).toEqual({
      type: 'sasjs-load',
      files: { '/sasjs/drive/stored.txt': 'stored' }
    })
    expect(rows.has('current')).toBe(false)
  })

  it('as() stores the subject, returns the pair and restarts the app', async () => {
    const controller = { postMessage: jest.fn() }
    // no boot: `ready` never resolves, so the only question asked is `as()`'s
    const { window, listeners, rows } = loadPersist({ controller })
    window.location = { reload: jest.fn() }

    const stop = answerAll(controller, listeners, (_index, type) =>
      type === 'sasjs-as'
        ? {
            username: 'sasjsuser',
            accessToken: 'access-for-user2',
            refreshToken: 'refresh-for-user2',
            identity: FIXTURE
          }
        : {}
    )

    const pair = await window.SASjsMock.as('sasjsuser')
    stop()

    expect(controller.postMessage).toHaveBeenCalledWith({
      type: 'sasjs-as',
      username: 'sasjsuser'
    })
    expect(pair).toEqual({
      username: 'sasjsuser',
      accessToken: 'access-for-user2',
      refreshToken: 'refresh-for-user2'
    })

    // the subject outlives the restart, beside the fixture it names
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(rows.get('current')).toEqual({
      fixture: FIXTURE,
      subject: 'sasjsuser'
    })
    expect(window.location.reload).toHaveBeenCalled()
  })

  it('surfaces a refusal from the worker rather than storing a subject', async () => {
    const controller = { postMessage: jest.fn() }
    const { window, listeners, rows } = loadPersist({ controller })

    const stop = answerAll(controller, listeners, (_index, type) =>
      type === 'sasjs-as' ? { error: 'no account named "nobody"' } : {}
    )

    await expect(window.SASjsMock.as('nobody')).rejects.toThrow(
      'no account named "nobody"'
    )
    stop()

    expect(rows.has('current')).toBe(false)
  })

  it('reset clears the identity beside the drive', async () => {
    const controller = { postMessage: jest.fn() }
    // no boot: the stored rows are what reset has to clear
    const { window, listeners, rows } = loadPersist({
      controller,
      seeded: { '/sasjs/drive/stored.txt': 'stored' },
      seededIdentity: { fixture: FIXTURE, subject: 'sasjsuser' }
    })

    const stop = answerAll(controller, listeners, () => ({}))

    await window.SASjsMock.reset()
    stop()

    expect(rows.has('current')).toBe(false)
    expect(rows.has('/sasjs/drive/stored.txt')).toBe(false)
  })
})
