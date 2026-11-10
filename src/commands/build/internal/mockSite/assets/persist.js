/**
 * Drive storage for the browser build: IndexedDB, owned by the page.
 *
 * The service worker hosts the runtime but may be terminated between requests,
 * so it holds no durable state. On boot this script reads the persisted drive
 * and identity and hands them to the worker; after every service run the worker
 * sends back the files it changed and the identity store's snapshot when a route
 * changed it, and both are written here.
 */
;(function () {
  const DB_NAME = 'sasjs-mock-host'
  const FILES = 'files'
  /**
   * The identity the visitor last had: the fixture the worker's store reported
   * and the account the visitor chose to view the app as. One row, because the
   * two are written together - a subject without the fixture it names would be a
   * boot signed in as an account the store no longer holds.
   */
  const IDENTITY = 'identity'
  const IDENTITY_KEY = 'current'

  const openDb = () =>
    new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 2)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(FILES)) db.createObjectStore(FILES)
        if (!db.objectStoreNames.contains(IDENTITY))
          db.createObjectStore(IDENTITY)
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })

  const withStore = async (mode, run, name = FILES) => {
    const db = await openDb()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(name, mode)
      const store = tx.objectStore(name)
      let result
      try {
        result = run(store)
      } catch (e) {
        reject(e)
        return
      }
      tx.oncomplete = () => resolve(result)
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
  }

  const readAll = () =>
    new Promise(async (resolve, reject) => {
      try {
        const db = await openDb()
        const keysReq = db
          .transaction(FILES, 'readonly')
          .objectStore(FILES)
          .getAllKeys()
        keysReq.onsuccess = () => {
          const keys = keysReq.result
          if (!keys.length) return resolve({})
          const valsReq = db
            .transaction(FILES, 'readonly')
            .objectStore(FILES)
            .getAll()
          valsReq.onsuccess = () => {
            const files = {}
            keys.forEach((k, i) => {
              if (typeof valsReq.result[i] === 'string')
                files[k] = valsReq.result[i]
            })
            resolve(files)
          }
          valsReq.onerror = () => reject(valsReq.error)
        }
        keysReq.onerror = () => reject(keysReq.error)
      } catch (e) {
        reject(e)
      }
    })

  const writeFiles = async (files) => {
    const entries = Object.entries(files || {})
    if (!entries.length) return { written: 0, deleted: 0 }
    let deleted = 0
    await withStore('readwrite', (store) => {
      for (const [path, contents] of entries) {
        if (contents === null || contents === undefined) {
          store.delete(path)
          deleted++
        } else {
          store.put(contents, path)
        }
      }
    })
    return { written: entries.length - deleted, deleted }
  }

  const clearAll = () => withStore('readwrite', (store) => store.clear())

  /**
   * The stored identity, `null` when there is none. A row whose shape is not the
   * one this script writes is ignored rather than handed on: the worker refuses a
   * fixture it cannot read by name, and re-sending a value that is not a row at
   * all would blame the fixture for a corrupt database.
   */
  const readIdentity = () =>
    new Promise(async (resolve, reject) => {
      try {
        const db = await openDb()
        const req = db
          .transaction(IDENTITY, 'readonly')
          .objectStore(IDENTITY)
          .get(IDENTITY_KEY)
        req.onsuccess = () => {
          const row = req.result
          resolve(row && typeof row === 'object' && row.fixture ? row : null)
        }
        req.onerror = () => reject(req.error)
      } catch (e) {
        reject(e)
      }
    })

  const writeIdentity = (row) =>
    withStore('readwrite', (store) => store.put(row, IDENTITY_KEY), IDENTITY)

  const clearIdentity = () =>
    withStore('readwrite', (store) => store.delete(IDENTITY_KEY), IDENTITY)

  /**
   * The build this site is, as the page can see it: mock-config.json carries the
   * stamp the build wrote over its host code and the seed it lays out. Read here
   * rather than passed down, because the page decides whether to keep a stored
   * drive before the worker is asked anything.
   *
   * The base is the worker's script URL, not the page's: the site can be served
   * from a folder, and a page reached at `/demo` (no trailing slash) has a
   * baseURI of `https://host/demo`, which resolves `host/mock-config.json` one
   * level too high. The worker sits at `<base>/sw.js` and fetches the same file
   * relative to itself, so its URL is the one definition of the site folder.
   *
   * Empty when the config cannot be read, which leaves the drive alone: a page
   * that cannot tell which build it is has no business dropping one.
   */
  const readBuildStamp = async (controller) => {
    try {
      const script = controller && controller.scriptURL
      // no controller URL means no way to name the site folder; keep the drive
      if (!script) return ''
      const res = await fetch(new URL('host/mock-config.json', script), {
        cache: 'no-store'
      })
      if (!res.ok) return ''
      const config = await res.json()
      return config && typeof config.buildStamp === 'string'
        ? config.buildStamp
        : ''
    } catch (e) {
      return ''
    }
  }

  /** Where the stamp of the build that wrote the stored drive is kept. */
  const BUILD_STAMP_KEY = 'sasjs-mock-build'

  /**
   * The stamp recorded for the stored drive, '' when there is none (a drive
   * from a build before stamps existed) and null when storage cannot be read at
   * all - which is not the same answer, and must not drop a drive on every load.
   */
  const storedBuildStamp = () => {
    try {
      return localStorage.getItem(BUILD_STAMP_KEY) || ''
    } catch (e) {
      return null
    }
  }

  const keepBuildStamp = (stamp) => {
    try {
      if (stamp) localStorage.setItem(BUILD_STAMP_KEY, stamp)
    } catch (e) {
      /* a browser that refuses storage still runs the site */
    }
  }

  const waitForController = () =>
    new Promise((resolve) => {
      if (navigator.serviceWorker.controller)
        return resolve(navigator.serviceWorker.controller)
      let waited = 0
      const tick = () => {
        if (navigator.serviceWorker.controller)
          return resolve(navigator.serviceWorker.controller)
        if (waited > 10000) return resolve(null)
        waited += 200
        setTimeout(tick, 200)
      }
      tick()
    })

  const askWorker = (message, expect) =>
    new Promise((resolve) => {
      const sw = navigator.serviceWorker
      let settled = false
      let timer
      const finish = (value) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        sw.removeEventListener('message', handler)
        resolve(value)
      }
      const handler = (ev) => {
        if (ev.data && ev.data.type === expect) finish(ev.data)
      }
      // The listener is removed on every path: a page that asks repeatedly with
      // a slow worker would otherwise stack one listener per call, and a reply
      // arriving after the timeout would land on a listener nobody reads.
      timer = setTimeout(
        () => finish({ error: 'timed out waiting for ' + expect }),
        20000
      )
      sw.addEventListener('message', handler)
      waitForController().then((controller) => {
        if (!controller)
          return finish({ error: 'no service worker controller' })
        controller.postMessage(message)
      })
    })

  // Persist whatever the worker reports as changed: drive files, and the
  // identity store's snapshot when a route created, changed or removed anything.
  navigator.serviceWorker.addEventListener('message', (ev) => {
    const data = ev.data || {}
    if (data.type === 'sasjs-persist') {
      writeFiles(data.files).catch((e) =>
        console.error('[sasjs-mock] persist failed', e)
      )
      if (data.identity)
        readIdentity()
          .then((row) =>
            // `undefined`, not null: no stored subject means the fixture's own
            // administrator, which is not the same as the anonymous caller a
            // null would name
            writeIdentity({
              fixture: data.identity,
              subject: row ? row.subject : undefined
            })
          )
          .catch((e) =>
            console.error('[sasjs-mock] identity persist failed', e)
          )
    }
    if (data.type === 'sasjs-host-error')
      console.error('[sasjs-mock] ' + data.path + ': ' + data.message)
  })

  window.SASjsMock = {
    readAll,
    writeFiles,
    clear: clearAll,
    identity: readIdentity,
    snapshot: () => askWorker({ type: 'sasjs-snapshot' }, 'sasjs-snapshot'),
    /**
     * Views the app as another account: `as('sasjsuser')` for a restricted user,
     * `as()` or `as('admin')` to return to the fixture's administrator.
     *
     * The worker issues a token pair for the account and answers as it from then
     * on; the subject and the fixture are stored here so a reload stays that
     * account, and the app is restarted so every screen redraws its menus and
     * refusals. The pair is returned for a caller who wants to send it as a
     * bearer token - nothing signs it, and no password is checked.
     */
    as: async (username) => {
      const answer = await askWorker(
        { type: 'sasjs-as', username },
        'sasjs-as-ack'
      )
      if (answer.error) throw new Error(answer.error)

      try {
        await writeIdentity({
          fixture: answer.identity,
          subject: answer.username
        })
      } catch (e) {
        // the subject still applies to this run; it just will not outlive it
        console.error('[sasjs-mock] could not store the subject: ' + e)
      }

      const pair = {
        username: answer.username,
        accessToken: answer.accessToken,
        refreshToken: answer.refreshToken
      }

      // a task, so the caller's promise resolves with the pair first
      setTimeout(() => {
        try {
          window.location.reload()
        } catch (e) {
          /* a page that cannot reload keeps the subject it already has */
        }
      }, 0)

      return pair
    },
    /**
     * The drive total in bytes, measured by the worker: it owns the stored
     * representation, so the figure stays the one `statSync` reports rather than
     * the length of the strings this store happens to hold - which would count
     * the base64 expansion and the marker of a byte entry.
     */
    stats: async () => {
      const answer = await askWorker({ type: 'sasjs-stats' }, 'sasjs-stats')
      // a worker that cannot report fails the read, as the other drive reads
      // do: a caller destructuring { files, bytes } must not be handed NaN, and
      // neither must a reply of an older shape that carries no stats at all
      if (answer.error) throw new Error(answer.error)
      if (!answer.stats) throw new Error('sasjs-stats reply carried no stats')
      return answer.stats
    },
    /**
     * Downloads the current drive as `mock-snapshot.json`. Drop that file in the
     * build folder as `mock-snapshot.json` and the next build ships it, so every
     * visitor starts from this state instead of from an empty drive.
     */
    download: async () => {
      const snapshot = await askWorker(
        { type: 'sasjs-snapshot' },
        'sasjs-snapshot'
      )
      const files = (snapshot && snapshot.files) || {}
      // the format stamp the runtime checks on load: a snapshot that outlived a
      // marker-format change is refused by name, instead of decoding as text
      const driveFormat = (self.SASjsMockRuntime || {}).DRIVE_FORMAT
      const blob = new Blob(
        [JSON.stringify({ format: driveFormat, files }, null, 2)],
        { type: 'application/json' }
      )
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'mock-snapshot.json'
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 10000)
      return Object.keys(files).length
    },
    reset: async () => {
      const answer = await askWorker({ type: 'sasjs-reset' }, 'sasjs-reset-ack')
      if (answer.error) throw new Error(answer.error)
      await clearAll()
      await clearIdentity()
      return true
    }
  }

  /**
   * Boots the worker with what is stored, and recovers when the stored identity
   * is one this build cannot read.
   *
   * A fixture outlives the build that wrote it, exactly as the drive does, and
   * the worker refuses one whose format stamp it does not speak - by name, and
   * with `errorKind: 'identity'`. Only that answer drops the stored row: the
   * row holds the accounts the visitor created as well as the fixture, so a
   * host-side failure (a drive that could not be read) leaves it alone.
   */
  const boot = async (files, stored) => {
    const loading = Object.keys(files).length > 0
    const type = loading ? 'sasjs-load' : 'sasjs-seed'
    const ack = loading ? 'sasjs-load-ack' : 'sasjs-seed-ack'

    const answer = await askWorker(
      {
        type,
        files,
        identity: stored ? stored.fixture : undefined,
        subject: stored ? stored.subject : undefined
      },
      ack
    )

    if (answer.error && stored && answer.errorKind === 'identity') {
      console.info('[sasjs-mock] ' + answer.error)
      try {
        await clearIdentity()
      } catch (e) {
        console.error('[sasjs-mock] could not clear the stored identity: ' + e)
      }
      return await askWorker({ type, files }, ack)
    }

    return answer
  }

  window.__sasjsMockReady = (async () => {
    await navigator.serviceWorker.ready
    const controller = await waitForController()
    if (!controller) return { error: 'no service worker controller' }

    let files = {}
    let stored = null
    try {
      files = await readAll()
      stored = await readIdentity()
    } catch (e) {
      console.error('[sasjs-mock] could not read storage: ' + e)
    }

    // A stored drive outlives the build that wrote it, so a returning visitor
    // would keep running that build's services - including ones the app being
    // loaded no longer matches. This build stamps the seed it ships, and a drive
    // whose stamp is absent or different is dropped rather than merged: a
    // partial drive from two builds is the one thing that cannot be reasoned
    // about. A site whose config carries no stamp keeps its drives, which is the
    // behaviour every build before this one had.
    const stamp = await readBuildStamp(controller)
    const previous = storedBuildStamp()
    if (
      Object.keys(files).length &&
      stamp &&
      previous !== null &&
      previous !== stamp
    ) {
      console.info(
        '[sasjs-mock] the stored drive is from another build - seeding this one'
      )
      try {
        await clearAll()
        // the identity is part of what this build ships, so a visitor who kept
        // the previous build's fixture would never see a changed
        // `mock-identity.json`: it goes with the drive, as it does on reset
        await clearIdentity()
      } catch (e) {
        console.error('[sasjs-mock] could not clear storage: ' + e)
      }
      files = {}
      stored = null
    }

    window.__sasjsMockBoot = await boot(files, stored)
    if (window.__sasjsMockBoot && !window.__sasjsMockBoot.error)
      keepBuildStamp(stamp)
    return window.__sasjsMockBoot
  })()
})()
