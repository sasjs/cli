export {}

/**
 * The page-side store: it owns the drive and asks the worker for snapshots. What
 * matters here is the ask/reply plumbing and the IndexedDB round trip - a
 * listener that outlives its request fires for a reply nobody reads, and a
 * timeout that reads like a snapshot empties the drive on download.
 */

/**
 * Enough of IndexedDB to exercise the store: two stores, no indexes.
 *
 * The FILES store is the drive and the IDENTITY store holds the fixture row and
 * the deletion tombstones, exactly as `persist.js` names them. They are kept
 * apart because the code depends on the difference: clearing the drive must not
 * take the visitor's accounts with it.
 */
const createIndexedDB = () => {
  const files = new Map<string, any>()
  const identity = new Map<string, any>()
  const dataFor = (name: string) => (name === 'identity' ? identity : files)

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

  const storeFor = (name: string) => {
    const data = () => dataFor(name)

    return {
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
  }

  const db: any = {
    objectStoreNames: { contains: () => true },
    createObjectStore: () => storeFor('files'),
    transaction: (name: string, _mode: string) => {
      const store = storeFor(name)
      const tx: any = {
        oncomplete: null,
        onerror: null,
        onabort: null,
        objectStore: () => store
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

  return { open, files, identity }
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
    indexedDBUnavailable?: boolean
    configNetworkFails?: boolean
    configStatus?: number
    configPayload?: any
    /** Where the worker sits, for a site published from a folder. */
    scriptURL?: string
    /** The page's own URL, as the browser reports it. */
    baseURI?: string
    /** The address the page was loaded from, which a sign-in redirect carries. */
    pageUrl?: string
    /**
     * The identity row the page stored: the fixture the worker reported and the
     * subject the visitor chose.
     */
    seededIdentity?: { fixture: any; subject?: string | null }
    /** Paths the visitor deleted, as the worker was told at boot. */
    seededDeleted?: string[]
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
  window.location = { href: options.pageUrl || 'https://host.test/' }
  window.history = {
    replaceState: (_state: any, _title: string, url: string) => {
      window.location.href = url
    }
  }
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
  ;(global as any).fetch = jest.fn(async (url: string) => {
    if (options.configNetworkFails) throw new Error('config network failed')
    return {
      ok: options.configStatus === undefined || options.configStatus === 200,
      status: options.configStatus || 200,
      json: async () =>
        options.configPayload === undefined
          ? { buildStamp: options.buildStamp || '' }
          : options.configPayload
    }
  })

  const idb = (() => {
    const fake = createIndexedDB()
    Object.entries(options.seeded || {}).forEach(([key, value]) =>
      fake.files.set(key, value)
    )
    // the identity row lives in its own store, under its own key
    if (options.seededIdentity)
      fake.identity.set('current', options.seededIdentity)
    // and the paths a visitor deleted, which a sharded site's index would
    // otherwise restore
    if (options.seededDeleted)
      fake.identity.set('deleted', options.seededDeleted)
    return fake
  })()
  const opened: string[] = []
  const originalOpen = idb.open
  idb.open = ((name: string) => {
    opened.push(name)
    return originalOpen()
  }) as any
  ;(global as any).indexedDB = options.indexedDBUnavailable
    ? {
        open: () => {
          throw new Error('indexedDB denied')
        }
      }
    : idb

  require('../assets/persist.js')

  // `source` is the worker that sent it, as a real MessageEvent carries: the
  // page answers the sender and nothing else. It defaults to the harness's
  // `controller`, which is the same worker in the ordinary case, and a test that
  // needs a different sender passes one.
  const reply = (data: any, source: any = controller) =>
    [...listeners].forEach((fn) => fn({ data, source }))

  return {
    window,
    listeners,
    removed,
    posted,
    reply,
    rows: idb.files,
    identityRows: idb.identity,
    stored: local,
    opened
  }
}

/**
 * Waits for the store's own handshake to land.
 *
 * A persist message is answered by a chain of transactions - write the files,
 * read the tombstone list, write it back - and the page does not expose the
 * promise. A fixed sleep is a race on a slow runner (Windows was the one that
 * failed), so the assertions poll for the change they expect instead.
 */
const settleUntil = async (check: () => boolean, timeout = 4000) => {
  const started = Date.now()
  while (Date.now() - started < timeout) {
    if (check()) return
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

describe('the page-side store', () => {
  it('isolates the database by worker mount and preserves the root name', async () => {
    const root = loadPersist()
    await root.window.SASjsMock.readAll()
    expect(root.opened).toContain('sasjs-mock-host')
    const nested = loadPersist({
      scriptURL: 'https://host.test/sas9/minimal/sw.js?v=1'
    })
    await nested.window.SASjsMock.readAll()
    expect(nested.opened).not.toContain('sasjs-mock-host')
  })
  it('ignores persistence messages from a worker at a different mount', async () => {
    const { reply, rows } = loadPersist({
      scriptURL: 'https://host.test/sas9/minimal/sw.js'
    })
    reply(
      { type: 'sasjs-persist', files: { '/foreign': 'wrong' } },
      {
        scriptURL: 'https://host.test/sasjs/minimal/sw.js',
        postMessage() {}
      }
    )
    await new Promise((resolve) => setTimeout(resolve, 40))
    expect(rows.has('/foreign')).toBe(false)
  })
  it('records a separate build stamp at a nested mount', async () => {
    const controller = { postMessage: jest.fn() }
    const { window, stored, listeners } = loadPersist({
      controller,
      scriptURL: 'https://host.test/sas9/minimal/sw.js?v=1',
      ready: Promise.resolve(),
      buildStamp: 'new-build'
    })
    const timer = setInterval(() => {
      for (const [message] of controller.postMessage.mock.calls)
        listeners.forEach((fn) => fn({ data: { type: message.type + '-ack' } }))
    }, 5)
    try {
      await window.__sasjsMockPersistReady
    } finally {
      clearInterval(timer)
    }
    expect(stored.has('sasjs-mock-build')).toBe(false)
    expect([...stored.values()]).toContain('new-build')
  })
  it('reports a config network error rather than booting an unknown drive', async () => {
    const { window, posted } = loadPersist({
      ready: Promise.resolve(),
      configNetworkFails: true
    })
    await expect(window.__sasjsMockPersistReady).rejects.toThrow(
      'config network failed'
    )
    expect(posted).toEqual([])
  })

  it('rejects an HTTP config failure without seeding or changing the stored drive', async () => {
    const { window, posted, rows } = loadPersist({
      ready: Promise.resolve(),
      configStatus: 503,
      seeded: { '/sasjs/drive/kept.txt': 'kept' }
    })
    await expect(window.__sasjsMockPersistReady).rejects.toThrow(
      'mock-config.json returned 503'
    )
    expect(posted).toEqual([])
    expect(rows.get('/sasjs/drive/kept.txt')).toBe('kept')
  })

  it('reports a controller that never claims the page during boot', async () => {
    jest.useFakeTimers()
    const { window, posted } = loadPersist({
      controller: null,
      ready: Promise.resolve()
    })
    const pending = window.__sasjsMockPersistReady
    await jest.advanceTimersByTimeAsync(11000)
    await expect(pending).resolves.toEqual({
      error: 'no service worker controller'
    })
    expect(posted).toEqual([])
    expect((global as any).fetch).not.toHaveBeenCalled()
  })

  it('does not seed over an unreadable stored drive', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {})
    const { window, posted } = loadPersist({
      ready: Promise.resolve(),
      indexedDBUnavailable: true
    })
    await expect(window.__sasjsMockPersistReady).rejects.toThrow(
      'indexedDB denied'
    )
    expect(posted).toEqual([])
    error.mockRestore()
  })
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

  it('stores the account a sign-in redirect carried, and strips the address', async () => {
    // a service worker is handed no cookies, so the sign-in page answers a
    // redirect carrying the account, and this is the page that stores it
    const controller = { postMessage: jest.fn() }
    const { window, listeners } = loadPersist({
      controller,
      ready: Promise.resolve(),
      pageUrl: 'https://host.test/?sasjs-caller=sasjsuser'
    })

    const answering = setInterval(() => {
      const asked = controller.postMessage.mock.calls
      if (!asked.length) return
      const type = asked[0][0].type
      ;[...listeners].forEach((fn) =>
        fn({ data: { type: type + '-ack', identity: FIXTURE } })
      )
    }, 5)

    await window.__sasjsMockPersistReady
    clearInterval(answering)

    expect(controller.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'sasjs-seed', subject: 'sasjsuser' })
    )
    // the address is consumed, so a reload does not sign in twice
    expect(window.location.href).not.toContain('sasjs-caller')

    const row = await window.SASjsMock.identity()
    expect(row.subject).toBe('sasjsuser')
  })

  it('does not store an account the fixture does not declare', async () => {
    // a mistyped or shared link must not outlive itself in storage
    const controller = { postMessage: jest.fn() }
    const { window, listeners, identityRows } = loadPersist({
      controller,
      ready: Promise.resolve(),
      pageUrl: 'https://host.test/?sasjs-caller=gone-user'
    })

    const answering = setInterval(() => {
      const calls = controller.postMessage.mock.calls
      if (!calls.length) return
      const type = calls[0][0].type
      ;[...listeners].forEach((fn) =>
        fn({ data: { type: type + '-ack', identity: FIXTURE } })
      )
    }, 5)

    await window.__sasjsMockPersistReady
    clearInterval(answering)

    expect(identityRows.size).toBe(0)
  })

  it('records the sign-in even when the stored drive had to be replaced', async () => {
    // the host-refusal branch retries with a boot that re-reads an address this
    // pass already stripped, so the handoff is stored before that return
    const controller = { postMessage: jest.fn() }
    const { window, listeners, identityRows } = loadPersist({
      controller,
      ready: Promise.resolve(),
      pageUrl: 'https://host.test/?sasjs-caller=sasjsuser',
      seededIdentity: { fixture: FIXTURE, subject: null },
      seededDeleted: ['/sasjs/drive/gone.txt']
    })

    let asked = 0
    const answering = setInterval(() => {
      const calls = controller.postMessage.mock.calls
      if (!calls.length) return
      const type = calls[0][0].type
      asked += 1
      ;[...listeners].forEach((fn) =>
        fn({
          data:
            asked === 1
              ? { type: type + '-ack', error: 'refused', errorKind: 'host' }
              : { type: type + '-ack', identity: FIXTURE }
        })
      )
    }, 5)

    await window.__sasjsMockPersistReady
    clearInterval(answering)

    expect(asked).toBeGreaterThan(1)
    expect(identityRows.get('current')?.subject).toBe('sasjsuser')
  })

  it('drops the account when the sign-out redirect asks it to', async () => {
    const controller = { postMessage: jest.fn() }
    const { window, listeners, identityRows } = loadPersist({
      controller,
      ready: Promise.resolve(),
      pageUrl: 'https://host.test/?sasjs-signout=1',
      seededIdentity: { fixture: FIXTURE, subject: 'sasjsuser' }
    })

    const stop = answerBoot(controller, listeners)
    await window.__sasjsMockPersistReady
    stop()

    // the boot answers as nobody named, and the row keeps the fixture without
    // the account: clearing it would drop the site's own accounts and load the
    // visitor's drive under the shipped fixture
    expect(controller.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'sasjs-seed', subject: undefined })
    )
    expect(identityRows.size).toBe(1)

    const row = await window.SASjsMock.identity()
    expect(row.subject).toBeUndefined()
    expect(row.fixture).toEqual(
      expect.objectContaining({ users: FIXTURE.users })
    )
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
    const { window, reply, rows, identityRows } = loadPersist()

    reply({ type: 'sasjs-persist', files: { '/sasjs/drive/c.txt': 'ccc' } })
    await settleUntil(() => rows.get('/sasjs/drive/c.txt') === 'ccc')

    expect(rows.get('/sasjs/drive/c.txt')).toBe('ccc')
  })

  /**
   * A deletion has to outlive the worker, and the page is the only store that can
   * keep it.
   *
   * The drive in a sharded build is not all in the page either: the index lists
   * every file the build ships, so a file the visitor deleted comes back on the
   * next load unless the path is remembered here and handed to the worker at
   * boot.
   */
  it('remembers a deleted path, and forgets it when the path is written again', async () => {
    const { window, reply, rows, identityRows } = loadPersist({
      seeded: { '/sasjs/drive/a.txt': 'a', '/sasjs/drive/b.txt': 'b' }
    })

    reply({ type: 'sasjs-persist', files: { '/sasjs/drive/a.txt': null } })
    await settleUntil(() => identityRows.has('deleted'))

    expect(identityRows.get('deleted')).toEqual(['/sasjs/drive/a.txt'])
    // the row itself is gone, and the tombstone is what stops the index bringing
    // it back
    expect(rows.has('/sasjs/drive/a.txt')).toBe(false)

    reply({ type: 'sasjs-persist', files: { '/sasjs/drive/a.txt': 'again' } })
    // the tombstone is written back after the file, so poll for it rather than
    // for the write that precedes it
    await settleUntil(() => !identityRows.has('deleted'))

    expect(identityRows.has('deleted')).toBe(false)
    expect(rows.get('/sasjs/drive/a.txt')).toBe('again')
  })

  it('writes no file when the worker could not read the drive whole', async () => {
    const controller = { postMessage: jest.fn() }
    const {
      window: page,
      listeners,
      reply
    } = loadPersist({
      controller,
      ready: Promise.resolve({})
    })

    // let the page's own boot finish first: a boot left pending resolves after the
    // suite has been torn down, and the runtime it resolves into has no window
    const answering = setInterval(() => {
      const asked = controller.postMessage.mock.calls
      if (!asked.length) return
      ;[...listeners].forEach((fn) =>
        fn({ data: { type: asked[0][0].type + '-ack', booted: true } })
      )
    }, 5)
    await page.__sasjsMockPersistReady
    clearInterval(answering)

    const pending = page.SASjsMock.download()
    await Promise.resolve()
    // the worker answers with what it has and says why it could not finish, and a
    // file built from that would be a capture with every app bundle missing
    reply({
      type: 'sasjs-snapshot',
      files: { '/sasjs/drive/a.txt': 'a' },
      error: 'ensureAll rejected: ENOENT'
    })

    await expect(pending).rejects.toThrow(/could not be read whole/)
  })

  it('drops the recorded deletions with the rest of the drive', async () => {
    const { window, listeners, rows, identityRows } = loadPersist({
      seeded: { '/sasjs/drive/a.txt': 'a' },
      seededDeleted: ['/sasjs/drive/a.txt']
    })

    const pending = window.SASjsMock.reset()
    await Promise.resolve()
    ;[...listeners].forEach((fn) => fn({ data: { type: 'sasjs-reset-ack' } }))
    await pending
    await settleUntil(() => !identityRows.has('deleted'))

    expect(identityRows.has('deleted')).toBe(false)
  })

  it('tells the worker which paths were deleted, so its index cannot restore them', async () => {
    const controller = { postMessage: jest.fn() }
    const { window, listeners } = loadPersist({
      controller,
      ready: Promise.resolve({}),
      seeded: { '/sasjs/drive/b.txt': 'b' },
      seededDeleted: ['/sasjs/drive/a.txt']
    })

    const answering = setInterval(() => {
      const asked = controller.postMessage.mock.calls
      if (!asked.length) return
      const type = asked[0][0].type
      ;[...listeners].forEach((fn) =>
        fn({ data: { type: type + '-ack', booted: true } })
      )
    }, 5)

    await window.__sasjsMockPersistReady
    clearInterval(answering)

    expect(controller.postMessage.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        type: 'sasjs-load',
        deleted: ['/sasjs/drive/a.txt']
      })
    )
  })

  it('resets the worker and the stored drive together', async () => {
    const { window, posted, reply, rows, identityRows } = loadPersist({
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

    const info = await window.__sasjsMockPersistReady
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

    await window.__sasjsMockPersistReady
    clearInterval(answering)

    expect(controller.postMessage).toHaveBeenCalledWith({
      type: 'sasjs-seed',
      files: {},
      identity: undefined,
      subject: undefined
    })
  })

  /**
   * The worker is terminated between requests and starts again with no drive at
   * all: it asks the page, which is the half that owns durable storage. Without
   * an answer it seeds, and every file the visitor made reads "File doesn't
   * exist." from then on.
   */
  it('answers the worker with the stored drive when it asks for one', async () => {
    const controller = { postMessage: jest.fn() }
    const files = { '/sasjs/drive/files/myfolder/.sasjslint': '{"a":1}' }
    const { reply } = loadPersist({
      controller,
      seeded: files,
      seededDeleted: ['/sasjs/drive/files/gone.sas']
    })

    reply({ type: 'sasjs-need-drive' })

    await settleUntil(() =>
      controller.postMessage.mock.calls.some(
        (call: any[]) => call[0].type === 'sasjs-load'
      )
    )

    // the deletions travel with it: a sharded site's index would otherwise
    // restore the paths the visitor removed
    expect(controller.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'sasjs-load',
        files,
        deleted: ['/sasjs/drive/files/gone.sas']
      })
    )
  })

  it('ignores a repeated ask while the first answer is still being prepared', async () => {
    // the worker retries when its budget expires, and the retry can land while
    // this page is still reading storage. Answering twice is two boots and two
    // loads of the same drive - the double install one-client-at-a-time exists
    // to prevent - so the repeat is dropped and the answer already on its way
    // counts for both
    const controller = { postMessage: jest.fn() }
    const { reply } = loadPersist({
      controller,
      seeded: { '/sasjs/drive/files/a.sas': 'a' }
    })

    reply({ type: 'sasjs-need-drive' })
    reply({ type: 'sasjs-need-drive' })

    await settleUntil(() => controller.postMessage.mock.calls.length > 0)
    // give a second answer every chance to arrive before counting
    await new Promise((resolve) => setTimeout(resolve, 50))

    const loads = controller.postMessage.mock.calls.filter(
      (call: any[]) => call[0].type === 'sasjs-load'
    )
    expect(loads).toHaveLength(1)
  })

  it('answers a second worker while the first answer is still being prepared', async () => {
    // a worker that activates mid-read is a different asker, and the guard
    // against a repeated ask is per worker: dropping its ask too would leave it
    // waiting out its budget and then seeding over the drive
    const first = { postMessage: jest.fn() }
    const second = { postMessage: jest.fn() }
    const { reply } = loadPersist({
      controller: first,
      seeded: { '/sasjs/drive/files/a.sas': 'a' }
    })

    reply({ type: 'sasjs-need-drive' }, first)
    reply({ type: 'sasjs-need-drive' }, second)

    await settleUntil(
      () =>
        first.postMessage.mock.calls.some(
          (c: any[]) => c[0].type === 'sasjs-load'
        ) &&
        second.postMessage.mock.calls.some(
          (c: any[]) => c[0].type === 'sasjs-load'
        )
    )

    for (const worker of [first, second]) {
      const loads = worker.postMessage.mock.calls.filter(
        (call: any[]) => call[0].type === 'sasjs-load'
      )
      expect(loads).toHaveLength(1)
    }
  })

  it('answers the sender when the page controls a different worker', async () => {
    // after a rollover a new worker can ask while `controller` still names its
    // predecessor, and a page that has not been claimed has no controller at
    // all - reaching for `controller` in either case answers the wrong worker,
    // or nothing, and the asker seeds over the drive
    const controller = { postMessage: jest.fn() }
    const asker = { postMessage: jest.fn() }
    const files = { '/sasjs/drive/files/kept.sas': 'kept' }
    const { reply } = loadPersist({ controller, seeded: files })

    reply({ type: 'sasjs-need-drive' }, asker)

    await settleUntil(() => asker.postMessage.mock.calls.length === 1)

    expect(asker.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'sasjs-load', files })
    )
    expect(controller.postMessage).not.toHaveBeenCalled()
  })

  it('answers a drive request with a seed when nothing is stored', async () => {
    const controller = { postMessage: jest.fn() }
    const { reply } = loadPersist({ controller })

    reply({ type: 'sasjs-need-drive' })

    await settleUntil(() =>
      controller.postMessage.mock.calls.some(
        (call: any[]) => call[0].type === 'sasjs-seed'
      )
    )

    // "nothing is stored" is an answer: the worker must stop waiting for one
    expect(controller.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'sasjs-seed', files: {} })
    )
  })

  /**
   * A drive that exists and cannot be read is not the same as no drive. Silence
   * would leave the worker waiting out its budget and seeding over the
   * visitor's files; the answer has to say so, and the worker fails the request
   * instead.
   */
  it('says the drive is unavailable when storage cannot be read', async () => {
    const controller = { postMessage: jest.fn() }
    const { reply } = loadPersist({ controller })

    // IndexedDB that refuses to open, as a locked or evicted store does
    ;(global as any).indexedDB.open = () => {
      const req: any = {
        result: undefined,
        onsuccess: null,
        onerror: null,
        onupgradeneeded: null
      }
      setTimeout(() => req.onerror && req.onerror(), 0)
      return req
    }

    reply({ type: 'sasjs-need-drive' })

    await settleUntil(() =>
      controller.postMessage.mock.calls.some(
        (call: any[]) => call[0].type === 'sasjs-drive-unavailable'
      )
    )

    expect(controller.postMessage).toHaveBeenCalledWith({
      type: 'sasjs-drive-unavailable'
    })
    // and it never claimed to have a drive
    expect(controller.postMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'sasjs-load' })
    )
  })

  it('keeps the answer it captured when the page moves on mid-read', async () => {
    // the read can outlive the page's own globals (a suite that tears its
    // fixtures down, a harness that swaps the controller). The worker that
    // asked is taken when the ask arrives, so the answer still reaches it - and
    // nothing a late callback touches can throw.
    const controller = { postMessage: jest.fn() }
    const { reply } = loadPersist({ controller })

    ;(global as any).indexedDB.open = () => {
      const req: any = {
        result: undefined,
        onsuccess: null,
        onerror: null,
        onupgradeneeded: null
      }
      setTimeout(() => req.onerror && req.onerror(), 20)
      return req
    }

    reply({ type: 'sasjs-need-drive' })
    // the page's globals go away while the read is still in flight
    delete (global as any).navigator

    await settleUntil(() =>
      controller.postMessage.mock.calls.some(
        (call: any[]) => call[0].type === 'sasjs-drive-unavailable'
      )
    )

    expect(controller.postMessage).toHaveBeenCalledWith({
      type: 'sasjs-drive-unavailable'
    })
  })

  it('takes the shipped seed when the worker refuses the stored drive', async () => {
    const controller = { postMessage: jest.fn() }
    const { reply, rows, identityRows } = loadPersist({
      controller,
      seeded: { '/sasjs/drive/files/refused.txt': 'x' }
    })

    reply({ type: 'sasjs-need-drive' })

    await settleUntil(() =>
      controller.postMessage.mock.calls.some(
        (call: any[]) => call[0].type === 'sasjs-load'
      )
    )

    // the worker refused the payload itself (`R.load` throwing), which is not
    // storage the page cannot read: re-sending it would be refused again, and
    // reporting it as unreadable would fail every request until the visitor
    // cleared storage by hand
    reply({
      type: 'sasjs-load-ack',
      error: 'the drive could not be installed',
      errorKind: 'host'
    })

    await settleUntil(() =>
      controller.postMessage.mock.calls.some(
        (call: any[]) => call[0].type === 'sasjs-seed'
      )
    )

    expect(controller.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'sasjs-seed', files: {} })
    )
    // the refused drive is gone, so a reload does not hand it over again
    expect(rows.size).toBe(0)
    expect(controller.postMessage).not.toHaveBeenCalledWith({
      type: 'sasjs-drive-unavailable'
    })
  })

  it('reports the drive unavailable when both the stored drive and seed are refused', async () => {
    const controller = { postMessage: jest.fn() }
    const { reply, rows } = loadPersist({
      controller,
      seeded: { '/sasjs/drive/files/refused.txt': 'x' }
    })

    reply({ type: 'sasjs-need-drive' })
    await until(() => controller.postMessage.mock.calls.length === 1)
    expect(controller.postMessage.mock.calls[0][0].type).toBe('sasjs-load')
    reply({ type: 'sasjs-load-ack', error: 'bad drive', errorKind: 'host' })
    await until(() => controller.postMessage.mock.calls.length === 2)
    expect(controller.postMessage.mock.calls[1][0].type).toBe('sasjs-seed')
    reply({ type: 'sasjs-seed-ack', error: 'bad seed', errorKind: 'host' })
    await until(() => controller.postMessage.mock.calls.length === 3)
    expect(controller.postMessage.mock.calls[2][0]).toEqual({
      type: 'sasjs-drive-unavailable'
    })
    expect(rows.size).toBe(0)
  })

  it('answers the worker that asked, even after the controller is gone', async () => {
    const controller = { postMessage: jest.fn() }
    const { reply } = loadPersist({
      controller,
      seeded: { '/sasjs/drive/files/a.txt': 'a' }
    })

    reply({ type: 'sasjs-need-drive' })
    // the worker that asked is replaced before the read finishes: the answer
    // belongs to it, not to whatever controls the page now
    ;(global as any).navigator.serviceWorker.controller = null

    await settleUntil(() =>
      controller.postMessage.mock.calls.some(
        (call: any[]) => call[0].type === 'sasjs-load'
      )
    )

    expect(controller.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'sasjs-load' })
    )
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
    // apart. The identity goes with it: the fixture is part of what a build
    // ships, so a changed `mock-identity.json` has to reach a returning visitor
    // rather than being filtered out by the fixture they already had.
    const controller = { postMessage: jest.fn() }
    const { window, listeners, stored, rows, identityRows } = loadPersist({
      controller,
      ready: Promise.resolve({}),
      seeded: { '/sasjs/drive/stored.txt': 'stored' },
      seededIdentity: { fixture: FIXTURE, subject: 'sasjsuser' },
      buildStamp: 'build-b',
      storedStamp: 'build-a'
    })

    const stop = answerBoot(controller, listeners)
    await window.__sasjsMockPersistReady
    stop()

    expect(controller.postMessage).toHaveBeenCalledWith({
      type: 'sasjs-seed',
      files: {},
      identity: undefined,
      subject: undefined
    })
    expect(stored.get('sasjs-mock-build')).toBe('build-b')
    // the old drive and the old fixture are gone, not merged with the new build
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
    await window.__sasjsMockPersistReady
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
    await window.__sasjsMockPersistReady
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
    await window.__sasjsMockPersistReady
    stop()

    expect(controller.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'sasjs-load' })
    )
  })

  it.each([null, { buildStamp: 42 }])(
    'keeps the drive when the config has no usable build stamp %#',
    async (configPayload) => {
      const controller = { postMessage: jest.fn() }
      const { window, listeners, rows } = loadPersist({
        controller,
        ready: Promise.resolve({}),
        seeded: { '/sasjs/drive/stored.txt': 'stored' },
        storedStamp: 'previous-build',
        configPayload
      })
      const stop = answerBoot(controller, listeners)
      try {
        await window.__sasjsMockPersistReady
      } finally {
        stop()
      }
      expect(controller.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'sasjs-load' })
      )
      expect(rows.get('/sasjs/drive/stored.txt')).toBe('stored')
    }
  )

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
    await window.__sasjsMockPersistReady
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
    await window.__sasjsMockPersistReady
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
  /**
   * Waits for an asynchronous write rather than guessing how long it takes: the
   * page persists through IndexedDB, whose requests settle on their own
   * schedule, and a fixed sleep that is comfortable on one runner is too short
   * on another.
   */
  const until = async (ready: () => boolean, timeout = 2000) => {
    const started = Date.now()
    while (!ready()) {
      if (Date.now() - started > timeout)
        throw new Error('timed out waiting for the write')
      await new Promise((resolve) => setTimeout(resolve, 5))
    }
  }

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
    await window.__sasjsMockPersistReady
    stop()

    expect(controller.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'sasjs-load',
        identity: FIXTURE,
        subject: 'sasjsuser'
      })
    )
  })

  it('keeps the drive when the worker loaded it but could not share it', async () => {
    // a drive the worker accepted and loaded, whose write-back to the other tabs
    // failed, is not a refused drive: clearing it would delete files the worker
    // is serving, so the failure is reported and storage is left alone
    const controller = { postMessage: jest.fn() }
    const { window, listeners, rows } = loadPersist({
      controller,
      ready: Promise.resolve({}),
      seeded: { '/sasjs/drive/stored.txt': 'stored' }
    })

    const stop = answerAll(controller, listeners, (index) =>
      index === 0
        ? { error: 'a tab closed mid-broadcast', errorKind: 'persist' }
        : { booted: true }
    )
    await window.__sasjsMockPersistReady
    stop()

    expect(rows.has('/sasjs/drive/stored.txt')).toBe(true)
    // and it was not re-seeded over either
    const seeds = controller.postMessage.mock.calls.filter(
      ([message]: any[]) => message.type === 'sasjs-seed'
    )
    expect(seeds).toHaveLength(0)
  })

  it('stores the fixture the worker reports when a route changed it', async () => {
    const controller = { postMessage: jest.fn() }
    const { reply, rows, identityRows } = loadPersist({ controller })

    reply({ type: 'sasjs-persist', files: {}, identity: FIXTURE })
    await until(() => identityRows.has('current'))

    expect(identityRows.get('current')).toEqual({
      fixture: FIXTURE,
      subject: undefined
    })
  })

  it('drops a stored fixture this build cannot read, and boots from its own', async () => {
    // a store written by an older build is refused by the worker BY NAME; the
    // page then boots from the fixture the site ships rather than waiting out a
    // boot that never answers
    const controller = { postMessage: jest.fn() }
    const { window, listeners, rows, identityRows } = loadPersist({
      controller,
      ready: Promise.resolve({}),
      seeded: { '/sasjs/drive/stored.txt': 'stored' },
      seededIdentity: { fixture: { ...FIXTURE, format: 0 }, subject: null }
    })

    const stop = answerAll(controller, listeners, (index) =>
      index === 0
        ? {
            error: 'The identity fixture states format 0.',
            errorKind: 'identity'
          }
        : { booted: true }
    )

    const boot = await window.__sasjsMockPersistReady
    stop()

    expect(boot).toEqual({ type: 'sasjs-load-ack', booted: true })
    // the retry carries the drive, and none of the fixture it could not read
    expect(controller.postMessage.mock.calls[1][0]).toEqual({
      type: 'sasjs-load',
      files: { '/sasjs/drive/stored.txt': 'stored' }
    })
    expect(identityRows.has('current')).toBe(false)
  })

  it('takes the shipped seed when the worker refuses the stored drive, and keeps the accounts', async () => {
    // a refused drive is not a refused fixture: the drive is dropped - it is
    // what the worker will not accept, so re-sending it would be refused again
    // - while the identity row, which holds the accounts the visitor created,
    // stays exactly as it was
    const controller = { postMessage: jest.fn() }
    const { window, reply, rows, identityRows } = loadPersist({
      controller,
      ready: Promise.resolve({}),
      seeded: { '/sasjs/drive/stored.txt': 'stored' },
      seededIdentity: { fixture: FIXTURE, subject: 'sasjsuser' }
    })

    // the stored drive goes first, and the worker refuses the payload itself
    await until(() => controller.postMessage.mock.calls.length === 1)
    expect(controller.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'sasjs-load' })
    )
    reply({
      type: 'sasjs-load-ack',
      error: 'the drive could not be read',
      errorKind: 'host'
    })

    // so the drive is dropped and the site's own seed asked for - with the
    // account it already holds. A seed without it puts a visitor who signed in
    // as one of their own accounts back on the shipped fixture while their row
    // stays in storage, which is the half the IndexedDB assertion below cannot
    // see
    await until(() => controller.postMessage.mock.calls.length === 2)
    expect(controller.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'sasjs-seed',
        files: {},
        identity: FIXTURE,
        subject: 'sasjsuser'
      })
    )
    reply({ type: 'sasjs-seed-ack', booted: true })

    const boot = await window.__sasjsMockPersistReady
    expect(boot).toEqual(expect.objectContaining({ booted: true }))
    expect(rows.size).toBe(0)

    // ...while the fixture and the account it names are still stored
    expect(identityRows.get('current')).toEqual({
      fixture: FIXTURE,
      subject: 'sasjsuser'
    })
  })

  it('as() stores the subject, returns the pair and restarts the app', async () => {
    const controller = { postMessage: jest.fn() }
    // no boot: `ready` never resolves, so the only question asked is `as()`'s
    const { window, listeners, rows, identityRows } = loadPersist({
      controller
    })
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
    await until(() => window.location.reload.mock.calls.length > 0)
    await until(() => identityRows.has('current'))
    expect(identityRows.get('current')).toEqual({
      fixture: FIXTURE,
      subject: 'sasjsuser'
    })
    expect(window.location.reload).toHaveBeenCalled()
  })

  it('surfaces a refusal from the worker rather than storing a subject', async () => {
    const controller = { postMessage: jest.fn() }
    const { window, listeners, rows, identityRows } = loadPersist({
      controller
    })

    const stop = answerAll(controller, listeners, (_index, type) =>
      type === 'sasjs-as' ? { error: 'no account named "nobody"' } : {}
    )

    await expect(window.SASjsMock.as('nobody')).rejects.toThrow(
      'no account named "nobody"'
    )
    stop()

    expect(identityRows.has('current')).toBe(false)
  })

  it('reset reports a refusal from the worker rather than claiming success', async () => {
    const controller = { postMessage: jest.fn() }
    const { window, listeners } = loadPersist({ controller })

    const stop = answerAll(controller, listeners, (_index, type) =>
      type === 'sasjs-reset'
        ? { error: 'host/identity.json cannot be used: it is not readable' }
        : {}
    )

    await expect(window.SASjsMock.reset()).rejects.toThrow(
      'host/identity.json cannot be used'
    )
    stop()
  })

  it('reset clears the identity beside the drive', async () => {
    const controller = { postMessage: jest.fn() }
    // no boot: the stored rows are what reset has to clear
    const { window, listeners, rows, identityRows } = loadPersist({
      controller,
      seeded: { '/sasjs/drive/stored.txt': 'stored' },
      seededIdentity: { fixture: FIXTURE, subject: 'sasjsuser' }
    })

    const stop = answerAll(controller, listeners, () => ({}))

    await window.SASjsMock.reset()
    stop()

    expect(identityRows.has('current')).toBe(false)
    expect(rows.has('/sasjs/drive/stored.txt')).toBe(false)
  })
})
