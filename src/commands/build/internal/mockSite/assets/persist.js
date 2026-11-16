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
  /**
   * The drive paths the visitor deleted, kept beside the identity rather than in
   * the files store because a deleted file has no row to keep it in. A sharded
   * site's index lists every file the build ships, so this list is what stops a
   * deletion from being undone by the next page load.
   */
  const DELETED_KEY = 'deleted'

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

  /** The drive paths this visitor deleted, `[]` when the store is new or unreadable. */
  const readDeleted = async () => {
    try {
      const db = await openDb()
      return await new Promise((resolve) => {
        const req = db
          .transaction(IDENTITY, 'readonly')
          .objectStore(IDENTITY)
          .get(DELETED_KEY)
        req.onsuccess = () =>
          resolve(Array.isArray(req.result) ? req.result : [])
        req.onerror = () => resolve([])
      })
    } catch (e) {
      return []
    }
  }

  // no tombstones is no row: an empty list left behind would read as a stored
  // drive that had something in it
  const writeDeleted = (paths) =>
    paths.length
      ? withStore(
          'readwrite',
          (store) => store.put(paths, DELETED_KEY),
          IDENTITY
        )
      : withStore('readwrite', (store) => store.delete(DELETED_KEY), IDENTITY)

  const writeFiles = async (files) => {
    const entries = Object.entries(files || {})
    if (!entries.length) return { written: 0, deleted: 0 }
    let deleted = 0
    const removed = []
    const written = []
    await withStore('readwrite', (store) => {
      for (const [path, contents] of entries) {
        if (contents === null || contents === undefined) {
          store.delete(path)
          removed.push(path)
          deleted++
        } else {
          store.put(contents, path)
          written.push(path)
        }
      }
    })
    // the worker forgets deletions when it is terminated, so they are recorded
    // here: a path written again is not deleted any more, and a path deleted
    // again stays recorded
    if (removed.length || written.length) {
      const known = (await readDeleted()).filter(
        (path) => !written.includes(path)
      )
      for (const path of removed) if (!known.includes(path)) known.push(path)
      await writeDeleted(known)
    }
    return { written: entries.length - deleted, deleted }
  }

  const clearAll = async () => {
    await withStore('readwrite', (store) => store.clear())
    await withStore('readwrite', (store) => store.delete(DELETED_KEY), IDENTITY)
  }

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
   * A network or HTTP failure rejects boot rather than silently using a drive
   * whose build cannot be verified. A readable config without a stamp keeps it.
   */
  const readBuildStamp = async (controller) => {
    const script = controller && controller.scriptURL
    if (!script) throw new Error('service worker script URL is unavailable')
    const res = await fetch(new URL('host/mock-config.json', script), {
      cache: 'no-store'
    })
    if (!res.ok) throw new Error('mock-config.json returned ' + res.status)
    const config = await res.json()
    return config && typeof config.buildStamp === 'string'
      ? config.buildStamp
      : ''
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

  /**
   * Asks the worker and waits for its answer.
   *
   * `controller` is the worker the caller means to talk to. A handshake that
   * arrived FROM a client has to be answered TO that client: `waitForController`
   * resolves whatever controls the page at that moment, and after a worker is
   * replaced it resolves nothing at all - ten seconds of waiting, and then a
   * drive the asking worker could have installed is reported as unavailable.
   */
  const askWorker = (message, expect, controller) =>
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

      if (controller) return controller.postMessage(message)

      waitForController().then((found) => {
        if (!found) return finish({ error: 'no service worker controller' })
        found.postMessage(message)
      })
    })

  // Persist whatever the worker reports as changed: drive files, and the
  // identity store's snapshot when a route created, changed or removed anything.
  /** The workers this page is preparing an answer for, by sender. */
  const answeringWorkers = new Set()

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

    /*
     * The worker asks for the drive when it starts without one.
     *
     * It holds no durable state - the browser terminates it between requests -
     * so a worker woken by the next request has an empty drive. Without this
     * answer it would seed over the visitor's, and the files they had made
     * would read "File doesn't exist." while a re-create of any path the site
     * ships would read "File already exists." Sending what is stored is the same
     * handshake the page makes at boot, which is why it goes through `boot`.
     *
     * A FAILED READ IS AN ANSWER TOO. Staying silent would leave the worker
     * waiting out its budget and then seeding over a drive that exists and is
     * merely unreadable this moment - the one outcome this handshake is here to
     * prevent. The worker fails that request instead, and asks again on the
     * next one.
     *
     * A worker that REFUSES the drive is not that case: `boot` drops the
     * refused payload and installs the shipped seed, because re-sending what it
     * just rejected would only be rejected again.
     */
    if (data.type === 'sasjs-need-drive') {
      // The SENDER is the worker to answer - `event.source` on a message from a
      // service worker is that worker - and `navigator.serviceWorker.controller`
      // is not used even as a fallback: after a rollover the controller still
      // names the previous worker (so the answer goes to one that is not serving
      // the request), and on a page that has not been claimed there is no
      // controller at all (so the answer goes nowhere). Either way the asker
      // waits out its budget and seeds over the drive this handshake exists to
      // preserve. No sender means no worker asked, and there is then nothing to
      // answer.
      //
      // The worker is taken now rather than read later: the reads below can
      // outlive it, and a late callback has no business reaching for `navigator`.
      const worker = ev.source
      if (!worker) return

      // A retry can land while this page is still answering the first ask - the
      // worker's budget expired, the read has not finished. A second answer is a
      // second boot and a second load of the same drive, which is the double
      // install the worker's one-client-at-a-time ordering exists to avoid, so
      // the repeat is dropped: the answer already on its way is the answer to
      // both.
      //
      // Per worker, not per page: a worker that activates mid-read - the
      // rollover the comment above describes - is a different asker, and
      // dropping its ask would leave it waiting out its budget and then seeding
      // over the drive, which is the loss this whole handshake exists to
      // prevent.
      if (answeringWorkers.has(worker)) return
      answeringWorkers.add(worker)

      const answerTo = (message) => worker.postMessage(message)

      Promise.all([readAll(), readIdentity(), readDeleted()])
        .then(([files, stored, deleted]) =>
          boot(files, stored, deleted, worker)
        )
        .then((answer) => {
          // only the seed being refused as well reaches here: nothing this page
          // holds can be installed, so the worker must not seed over storage it
          // has not been given
          if (answer && answer.error && answer.errorKind === 'host')
            answerTo({ type: 'sasjs-drive-unavailable' })
        })
        .catch((e) => {
          // the read failed: a drive that exists and cannot be read, which the
          // worker must not answer with a seed
          console.error('[sasjs-mock] could not send the drive', e)
          answerTo({ type: 'sasjs-drive-unavailable' })
        })
        .finally(() => {
          answeringWorkers.delete(worker)
        })
    }
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
      // the worker answers `sasjs-snapshot` with whatever is in memory plus an
      // `error` when it could not read the drive whole. Downloading that would
      // hand the next build a capture with every app bundle missing and no sign
      // of it, which is the failure "whole means whole" exists to prevent.
      if (snapshot && snapshot.error)
        throw new Error('The drive could not be read whole: ' + snapshot.error)
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
   * Boots the worker with what is stored, and recovers from both refusals.
   *
   * A fixture outlives the build that wrote it, exactly as the drive does, and
   * the worker refuses one whose format stamp it does not speak - by name, and
   * with `errorKind: 'identity'`. Only that answer drops the stored row: the
   * row holds the accounts the visitor created as well as the fixture, so a
   * host-side failure leaves it alone.
   *
   * A `host` refusal is the other case, and it is the PAYLOAD the worker
   * rejects (`R.load` throwing on the drive it was sent), not storage the page
   * cannot read. Re-sending it would be refused again, and reporting it as
   * unreadable would fail every request until the visitor cleared storage by
   * hand - so the drive is what goes: it is cleared, and the site's own seed is
   * installed instead.
   *
   * `controller` is the worker that asked, when the call is answering a
   * handshake; the answer goes back to it rather than to whatever controls the
   * page by then.
   */
  const boot = async (files, stored, deleted, controller) => {
    // a drive of nothing but deletions is still a drive the visitor had: seeding
    // over it would bring back every file they removed
    const loading =
      Object.keys(files).length > 0 || (deleted && deleted.length > 0)
    const type = loading ? 'sasjs-load' : 'sasjs-seed'
    const ack = loading ? 'sasjs-load-ack' : 'sasjs-seed-ack'

    // only when there are some: an empty list is the common case, and the worker
    // reads an absent one as "nothing was deleted"
    const deletions = loading && deleted.length ? deleted : undefined

    const answer = await askWorker(
      {
        type,
        files,
        deleted: deletions,
        identity: stored ? stored.fixture : undefined,
        subject: stored ? stored.subject : undefined
      },
      ack,
      controller
    )

    if (answer.error && stored && answer.errorKind === 'identity') {
      console.info('[sasjs-mock] ' + answer.error)
      try {
        await clearIdentity()
      } catch (e) {
        console.error('[sasjs-mock] could not clear the stored identity: ' + e)
      }
      return await askWorker(
        { type, files, deleted: deletions },
        ack,
        controller
      )
    }

    if (answer.error && answer.errorKind === 'persist') {
      // the worker has the drive: only the write-back to the other tabs failed.
      // Nothing here is a refusal - clearing would delete a drive it is serving,
      // and re-sending would write it again - so the failure is reported and the
      // answer is treated as the success it is.
      console.warn(
        '[sasjs-mock] the drive loaded but could not be shared with the other tabs: ' +
          answer.error
      )
      return { ...answer, error: undefined, errorKind: undefined }
    }

    if (answer.error && answer.errorKind === 'host' && loading) {
      console.warn(
        '[sasjs-mock] the worker refused the stored drive - taking the shipped seed instead'
      )
      try {
        await clearAll()
      } catch (e) {
        console.error('[sasjs-mock] could not clear the refused drive: ' + e)
      }
      // empty files, so this is a seed and the branch above cannot repeat. The
      // identity travels: the worker refused the DRIVE, not the account, and a
      // seed without it would put a visitor who signed in with an account they
      // created back on the shipped fixture for the rest of the session, while
      // their row stays in storage. An identity the worker does refuse comes
      // back as `errorKind: 'identity'`, which the branch above clears and
      // retries.
      return await boot({}, stored, [], controller)
    }

    return answer
  }

  window.__sasjsMockPersistReady = (async () => {
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
      throw e
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

    // the deletions go with the drive: a sharded site's index lists every file
    // the build ships, so the paths this visitor removed have to be named or the
    // page would restore them
    const deleted = await readDeleted()
    window.__sasjsMockBoot = await boot(files, stored, deleted)
    if (window.__sasjsMockBoot && !window.__sasjsMockBoot.error)
      keepBuildStamp(stamp)
    return window.__sasjsMockBoot
  })()
  // The loader attaches its own observer after this script's load event.
  window.__sasjsMockPersistReady.catch(() => {})
})()
