/**
 * Drive storage for the demo: IndexedDB, owned by the page.
 *
 * The service worker hosts the runtime but may be terminated between requests,
 * so it holds no durable state. On boot this script reads the persisted drive
 * and hands it to the worker; after every service run the worker sends back the
 * files it changed and they are written here.
 */
;(function () {
  const DB_NAME = 'dc-browser-host'
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
        const keysReq = db.transaction(STORE, 'readonly').objectStore(STORE).getAllKeys()
        keysReq.onsuccess = () => {
          const keys = keysReq.result
          if (!keys.length) return resolve({})
          const valsReq = db.transaction(STORE, 'readonly').objectStore(STORE).getAll()
          valsReq.onsuccess = () => {
            const files = {}
            keys.forEach((k, i) => {
              if (typeof valsReq.result[i] === 'string') files[k] = valsReq.result[i]
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
      if (navigator.serviceWorker.controller) return resolve(navigator.serviceWorker.controller)
      let waited = 0
      const tick = () => {
        if (navigator.serviceWorker.controller) return resolve(navigator.serviceWorker.controller)
        if (waited > 10000) return resolve(null)
        waited += 200
        setTimeout(tick, 200)
      }
      tick()
    })

  const askWorker = (message, expect) =>
    new Promise((resolve) => {
      const sw = navigator.serviceWorker
      const handler = (ev) => {
        if (ev.data && ev.data.type === expect) {
          sw.removeEventListener('message', handler)
          resolve(ev.data)
        }
      }
      sw.addEventListener('message', handler)
      waitForController().then((controller) => {
        if (!controller) return resolve({ error: 'no service worker controller' })
        controller.postMessage(message)
      })
      setTimeout(() => resolve({ timeout: true }), 20000)
    })

  // Persist whatever the worker reports as changed.
  navigator.serviceWorker.addEventListener('message', (ev) => {
    const data = ev.data || {}
    if (data.type === 'dc-persist') writeFiles(data.files).catch((e) => console.error('[dc-host] persist failed', e))
    if (data.type === 'dc-host-error') console.error('[dc-host] ' + data.path + ': ' + data.message)
  })

  window.__dcStorage = {
    readAll,
    writeFiles,
    clear: clearAll,
    snapshot: () => askWorker({ type: 'dc-snapshot' }, 'dc-snapshot'),
    stats: async () => {
      const files = await readAll()
      const paths = Object.keys(files)
      return { files: paths.length, bytes: paths.reduce((t, p) => t + files[p].length, 0) }
    },
    /**
     * Downloads the current drive as `mock-snapshot.json`. Drop that file in the
     * build folder as `mock-snapshot.json` and the next build ships it, so every
     * visitor starts from this state instead of from an empty drive.
     */
    download: async () => {
      const snapshot = await askWorker({ type: 'dc-snapshot' }, 'dc-snapshot')
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
      await askWorker({ type: 'dc-reset' }, 'dc-reset-ack')
      await clearAll()
      return true
    }
  }

  window.__dcPersistReady = (async () => {
    await navigator.serviceWorker.ready
    const controller = await waitForController()
    if (!controller) return { error: 'no service worker controller' }

    let files = {}
    try {
      files = await readAll()
    } catch (e) {
      console.error('[dc-host] could not read storage: ' + e)
    }

    if (Object.keys(files).length) {
      window.__dcBoot = await askWorker({ type: 'dc-load', files }, 'dc-load-ack')
    } else {
      window.__dcBoot = await askWorker({ type: 'dc-seed' }, 'dc-seed-ack')
    }
    return window.__dcBoot
  })()
})()
