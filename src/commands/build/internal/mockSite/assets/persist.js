/**
 * Drive storage for the browser build: IndexedDB, owned by the page.
 *
 * The service worker hosts the runtime but may be terminated between requests,
 * so it holds no durable state. On boot this script reads the persisted drive
 * and hands it to the worker; after every service run the worker sends back the
 * files it changed and they are written here.
 */
;(function () {
  const DB_NAME = 'sasjs-mock-host'
  const STORE = 'files'

  const openDb = () =>
    new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })

  const withStore = async (mode, run) => {
    const db = await openDb()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode)
      const store = tx.objectStore(STORE)
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
          .transaction(STORE, 'readonly')
          .objectStore(STORE)
          .getAllKeys()
        keysReq.onsuccess = () => {
          const keys = keysReq.result
          if (!keys.length) return resolve({})
          const valsReq = db
            .transaction(STORE, 'readonly')
            .objectStore(STORE)
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

  // Persist whatever the worker reports as changed.
  navigator.serviceWorker.addEventListener('message', (ev) => {
    const data = ev.data || {}
    if (data.type === 'sasjs-persist')
      writeFiles(data.files).catch((e) =>
        console.error('[sasjs-mock] persist failed', e)
      )
    if (data.type === 'sasjs-host-error')
      console.error('[sasjs-mock] ' + data.path + ': ' + data.message)
  })

  window.SASjsMock = {
    readAll,
    writeFiles,
    clear: clearAll,
    snapshot: () => askWorker({ type: 'sasjs-snapshot' }, 'sasjs-snapshot'),
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
      const blob = new Blob([JSON.stringify({ files }, null, 2)], {
        type: 'application/json'
      })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'mock-snapshot.json'
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 10000)
      return Object.keys(files).length
    },
    reset: async () => {
      await askWorker({ type: 'sasjs-reset' }, 'sasjs-reset-ack')
      await clearAll()
      return true
    }
  }

  window.__sasjsMockReady = (async () => {
    await navigator.serviceWorker.ready
    const controller = await waitForController()
    if (!controller) return { error: 'no service worker controller' }

    let files = {}
    try {
      files = await readAll()
    } catch (e) {
      console.error('[sasjs-mock] could not read storage: ' + e)
    }

    if (Object.keys(files).length) {
      window.__sasjsMockBoot = await askWorker(
        { type: 'sasjs-load', files },
        'sasjs-load-ack'
      )
    } else {
      window.__sasjsMockBoot = await askWorker(
        { type: 'sasjs-seed' },
        'sasjs-seed-ack'
      )
    }
    return window.__sasjsMockBoot
  })()
})()
