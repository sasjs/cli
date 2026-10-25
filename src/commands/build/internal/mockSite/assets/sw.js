/**
 * Service-worker host for the browser build.
 *
 * Running the backend here (rather than inside the page) means every request is
 * a real network-layer request: DevTools > Network lists it as "(from
 * ServiceWorker)", with the request payload and the response body inspectable.
 *
 * Storage is owned by the page (host/persist.js) because a service worker can
 * be terminated between requests, and some browsers do not share IndexedDB
 * between the page and its worker. The page hands in the drive at boot and
 * receives the changed files back after every run.
 *
 * TRUST MODEL: this is a single-user, no-auth host. It answers every /SASjsApi/
 * path on the site's origin, runs whatever program the request names, and runs
 * the code a code/execute request carries - the same contract a SASjs server
 * offers, minus the server. Nothing here is a boundary: a page at this origin
 * can already do all of it, because a visitor's own browser is the client. So
 * a site holding anything private, or one served from a shared origin, belongs
 * behind a real server rather than a static host.
 */
importScripts('/host/runtime-core.js')

const R = self.SASjsMockRuntime
const LOGS_SEPARATOR = 'SASJS_LOGS_SEPARATOR_163ee17b6ff24f028928972d80a26784'

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) =>
  event.waitUntil(self.clients.claim())
)

const json = (obj, status) =>
  new Response(JSON.stringify(obj, null, 2), {
    status: status || 200,
    headers: { 'content-type': 'application/json' }
  })

const text = (body, status) =>
  new Response(body, {
    status: status || 200,
    headers: { 'content-type': 'text/plain' }
  })

/**
 * A byte body travels as base64. The runtime encodes it, but a drive restored
 * from a snapshot someone edited can hold a broken entry, so a decode failure
 * becomes a reported error rather than an unhandled rejection inside the
 * worker - the caller sees the corrupt entry instead of a request that never
 * answers.
 */
const toBytes = (base64) => {
  try {
    const binary = atob(String(base64 || '').replace(/\s+/g, ''))
    const out = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
    return out
  } catch (e) {
    const error = new Error(
      'Corrupt binary entry on the drive: not valid base64'
    )
    error.status = 500
    throw error
  }
}

// ------------------------------------------------------------ webout headers
// A service declares the response it wants by writing `Name: value` lines to
// the file the preamble hands it as _SASJS_WEBOUT_HEADERS - the same channel
// %mp_streamfile uses on the SAS side, and the one the server reads. Only the
// two headers that change how a reply is delivered are applied: the content
// type, and the disposition that makes the browser save it under the name the
// service chose. Everything else (cache-control, cookies, ...) has no meaning
// on a static host.
const RESPONSE_HEADERS = ['content-type', 'content-disposition']

/**
 * Parses what the service wrote. A header value is a byte string, so everything
 * up to U+00FF is passed through as written - the same bytes node writes when
 * the server sets the same header, which is what the mock has to match. HTAB is
 * allowed inside a field value by HTTP and the server passes it through, so it
 * is part of the set. A value above U+00FF, or one with a CR, LF or NUL, would
 * make the Response constructor throw, so that header is dropped and the body is
 * still served.
 *
 * A filename outside ASCII belongs in RFC 6266 form
 * (`filename*=UTF-8''r%C3%A9sum%C3%A9.csv`) - raw non-ASCII bytes in a header
 * are not portable, on this host or on the server.
 */
const HEADER_VALUE = /^[\x09\x20-\x7E\xA0-\xFF]+$/

const parseHeaders = (content) => {
  const headers = {}
  String(content || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const separator = line.indexOf(':')
      if (separator < 1) return
      const name = line.slice(0, separator).trim().toLowerCase()
      const value = line.slice(separator + 1).trim()
      if (!RESPONSE_HEADERS.includes(name)) return
      if (!HEADER_VALUE.test(value)) return
      headers[name] = value
    })
  return headers
}

/**
 * The reply a run produces: the webout, in the shape and under the name the
 * service asked for. A debug reply is the webout framed with the log, so it
 * stays text - honouring a download there would put the frame in the file.
 */
const weboutResponse = (result, debug) => {
  if (debug)
    return text(
      [result.webout, LOGS_SEPARATOR, result.log, LOGS_SEPARATOR].join('\n')
    )

  const headers = parseHeaders(result.headers)
  if (result.binary) {
    if (!headers['content-type'])
      headers['content-type'] = 'application/octet-stream'
    return new Response(toBytes(result.webout), { status: 200, headers })
  }
  return new Response(result.webout, { status: 200, headers })
}

const broadcast = async (message) => {
  const clients = await self.clients.matchAll({ includeUncontrolled: true })
  clients.forEach((client) => client.postMessage(message))
}

const persistChanges = async () => {
  const files = R.takeDirty()
  if (Object.keys(files).length)
    await broadcast({ type: 'sasjs-persist', files })
}

const readPayload = async (request) => {
  if (request.method === 'GET' || request.method === 'HEAD')
    return { params: {}, tables: [] }
  const type = request.headers.get('content-type') || ''
  if (!type.includes('application/json')) {
    try {
      const form = await request.formData()
      const params = {}
      const tables = []
      for (const [k, v] of form.entries()) {
        if (typeof v === 'string') params[k] = v
        else
          tables.push({
            name: k,
            filename: v.name || k + '.csv',
            csv: await v.text()
          })
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
      return json({
        mode: 'desktop',
        cors: 'disabled',
        whiteList: [],
        protocol: 'browser',
        runTimes: ['js']
      })
    }

    if (path.endsWith('/SASjsApi/drive/folder')) {
      return json(await R.list(query._folderPath || ''))
    }

    if (path.endsWith('/SASjsApi/drive/filetree')) {
      return json(R.tree())
    }

    if (path.endsWith('/SASjsApi/drive/file') && request.method === 'GET') {
      const file = R.read(query._filePath || '')
      return file.binary
        ? new Response(toBytes(file.contents), {
            headers: { 'content-type': 'application/octet-stream' }
          })
        : text(file.contents)
    }

    if (
      path.endsWith('/SASjsApi/stp/execute') ||
      path.endsWith('/SASjsApi/code/execute')
    ) {
      const payload = await readPayload(request)
      const merged = Object.assign({}, query, payload.params)
      const program = merged._program
      const code =
        payload.json && payload.json.code ? payload.json.code : undefined
      if (!program && !code)
        return json({ message: '_program is required' }, 400)

      const result = R.run({
        program,
        code,
        params: merged,
        tables: payload.tables
      })
      await persistChanges()
      if (result.error) {
        return json(
          {
            status: 'failure',
            message: 'Job execution failed.',
            error: result.error
          },
          500
        )
      }
      const debug = String(merged._debug || '').length > 0
      return weboutResponse(result, debug)
    }

    if (path.includes('/SASjsApi/session')) {
      return json({ state: 'completed' })
    }

    return json(
      { message: 'Not implemented by the browser host: ' + path },
      404
    )
  } catch (e) {
    const message = (e && e.stack) || String(e)
    broadcast({ type: 'sasjs-host-error', path, message })
    return json(
      { message: (e && e.message) || String(e) },
      (e && e.status) || 500
    )
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
    case 'sasjs-load':
      event.waitUntil(
        R.load(data.files || {}).then(async () => {
          await persistChanges()
          reply({
            type: 'sasjs-load-ack',
            boot: R.bootInfo(),
            stats: R.stats()
          })
        })
      )
      break

    case 'sasjs-seed':
      event.waitUntil(
        R.seed().then(async () => {
          await persistChanges()
          reply({
            type: 'sasjs-seed-ack',
            boot: R.bootInfo(),
            stats: R.stats()
          })
        })
      )
      break

    case 'sasjs-reset':
      event.waitUntil(
        R.reset().then(async () => {
          await persistChanges()
          reply({ type: 'sasjs-reset-ack', boot: R.bootInfo() })
        })
      )
      break

    case 'sasjs-snapshot':
      reply({ type: 'sasjs-snapshot', files: R.dumpAll() })
      break

    case 'sasjs-stats':
      event.waitUntil(
        R.ensureReady().then(() => {
          try {
            reply({ type: 'sasjs-stats', boot: R.bootInfo(), stats: R.stats() })
          } catch (e) {
            // a corrupt entry fails the whole total, so the page is answered
            // with the reason instead of waiting out its own timeout
            reply({
              type: 'sasjs-stats',
              error: (e && e.message) || String(e)
            })
          }
        })
      )
      break
  }
})
