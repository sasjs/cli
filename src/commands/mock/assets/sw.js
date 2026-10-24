/**
 * Service-worker host for the Data Controller single-page demo.
 *
 * Running the backend here (rather than inside the page) means every request is
 * a real network-layer request: DevTools > Network lists it as "(from
 * ServiceWorker)", with the request payload and the response body inspectable.
 *
 * Storage is owned by the page (host/persist.js) because a service worker can
 * be terminated between requests, and some browsers do not share IndexedDB
 * between the page and its worker. The page hands in the drive at boot and
 * receives the changed files back after every run.
 */
importScripts('/host/runtime-core.js')

const R = self.DCRuntime
const LOGS_SEPARATOR = 'SASJS_LOGS_SEPARATOR_163ee17b6ff24f028928972d80a26784'

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

const json = (obj, status) =>
  new Response(JSON.stringify(obj, null, 2), {
    status: status || 200,
    headers: { 'content-type': 'application/json' }
  })

const text = (body, status) =>
  new Response(body, { status: status || 200, headers: { 'content-type': 'text/plain' } })

const broadcast = async (message) => {
  const clients = await self.clients.matchAll({ includeUncontrolled: true })
  clients.forEach((client) => client.postMessage(message))
}

const persistChanges = async () => {
  const files = R.takeDirty()
  if (Object.keys(files).length) await broadcast({ type: 'dc-persist', files })
}

const readPayload = async (request) => {
  if (request.method === 'GET' || request.method === 'HEAD') return { params: {}, tables: [] }
  const type = request.headers.get('content-type') || ''
  if (!type.includes('application/json')) {
    try {
      const form = await request.formData()
      const params = {}
      const tables = []
      for (const [k, v] of form.entries()) {
        if (typeof v === 'string') params[k] = v
        else tables.push({ name: k, filename: v.name || k + '.csv', csv: await v.text() })
      }
      return { params, tables }
    } catch (e) {
      return { params: {}, tables: [] }
    }
  }
  const body = await request.json()
  return { params: body.params || {}, tables: body.tables || [], json: body }
}

const handle = async (request, url) => {
  const path = url.pathname.replace(/\/+$/, '')
  const query = {}
  for (const [k, v] of url.searchParams.entries()) query[k] = v

  try {
    await R.ensureReady()

    if (path.endsWith('/SASjsApi/info')) {
      return json({ mode: 'desktop', cors: 'disabled', whiteList: [], protocol: 'browser', runTimes: ['js'] })
    }

    if (path.endsWith('/SASjsApi/drive/folder')) {
      return json(await R.list(query._folderPath || ''))
    }

    if (path.endsWith('/SASjsApi/drive/filetree')) {
      return json(R.tree())
    }

    if (path.endsWith('/SASjsApi/drive/file') && request.method === 'GET') {
      return text(R.read(query._filePath || '').contents)
    }

    if (path.endsWith('/SASjsApi/stp/execute') || path.endsWith('/SASjsApi/code/execute')) {
      const payload = await readPayload(request)
      const merged = Object.assign({}, query, payload.params)
      const program = merged._program
      const code = payload.json && payload.json.code ? payload.json.code : undefined
      if (!program && !code) return json({ message: '_program is required' }, 400)

      const result = R.run({ program, code, params: merged, tables: payload.tables })
      await persistChanges()
      if (result.error) {
        return json({ status: 'failure', message: 'Job execution failed.', error: result.error }, 500)
      }
      const debug = String(merged._debug || '').length > 0
      return text(debug ? [result.webout, LOGS_SEPARATOR, result.log, LOGS_SEPARATOR].join('\n') : result.webout)
    }

    if (path.includes('/SASjsApi/session')) {
      return json({ state: 'completed' })
    }

    return json({ message: 'Not implemented by the browser host: ' + path }, 404)
  } catch (e) {
    const message = (e && e.stack) || String(e)
    broadcast({ type: 'dc-host-error', path, message })
    return json({ message: (e && e.message) || String(e) }, (e && e.status) || 500)
  }
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (url.origin !== self.location.origin) return
  if (!url.pathname.includes('/SASjsApi/')) return
  event.respondWith(handle(event.request, url))
})

// ------------------------------------------------------------- host messages
self.addEventListener('message', (event) => {
  const data = event.data || {}
  const reply = (message) => event.source && event.source.postMessage(message)

  switch (data.type) {
    case 'dc-load':
      event.waitUntil(
        R.load(data.files || {}).then(async () => {
          await persistChanges()
          reply({ type: 'dc-load-ack', boot: R.bootInfo(), stats: R.stats() })
        })
      )
      break

    case 'dc-seed':
      event.waitUntil(
        R.seed().then(async () => {
          await persistChanges()
          reply({ type: 'dc-seed-ack', boot: R.bootInfo(), stats: R.stats() })
        })
      )
      break

    case 'dc-reset':
      event.waitUntil(
        R.reset().then(async () => {
          await persistChanges()
          reply({ type: 'dc-reset-ack', boot: R.bootInfo() })
        })
      )
      break

    case 'dc-snapshot':
      reply({ type: 'dc-snapshot', files: R.dumpAll() })
      break

    case 'dc-stats':
      event.waitUntil(
        R.ensureReady().then(() =>
          reply({ type: 'dc-stats', boot: R.bootInfo(), stats: R.stats() })
        )
      )
      break
  }
})
