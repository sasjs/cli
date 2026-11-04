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
 * path on the site's origin, writes to the drive when a drive request names a
 * path, runs whatever program the request names, and runs the code a
 * code/execute request carries - the same contract a SASjs server offers, minus
 * the server. Nothing here is a boundary: a page at this origin can already do
 * all of it, because a visitor's own browser is the client. So a site holding
 * anything private, or one served from a shared origin, belongs behind a real
 * server rather than a static host.
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
 * A byte body travels as base64. The runtime encodes it, and refuses a drive
 * entry that will not decode before it hands the value over, so this is a plain
 * decode - the corrupt-entry error lives in one place, runtime-core.js.
 */
const toBytes = (base64) => {
  const binary = atob(String(base64 || '').replace(/\s+/g, ''))
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
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
 * Parses what the service wrote. A header value is a byte string, so a value up
 * to U+00FF is passed through as written - the same bytes node writes when the
 * server sets the same header, which is what the mock has to match. HTAB is
 * allowed inside a field value by HTTP and the server passes it through, so it
 * is part of the set.
 *
 * 0x7F and 0x80-0x9F are outside it: the browser's Headers implementation strips
 * those bytes from a value without complaining, which would save a download
 * under a name with characters missing, so such a value is refused instead and
 * the reply keeps its default delivery. CR, LF and NUL are refused for the same
 * reason - they make the Response constructor throw.
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
      // the last line for a name wins, and a value that cannot be sent removes
      // the header - the rule the server applies in extractHeaders
      if (HEADER_VALUE.test(value)) headers[name] = value
      else delete headers[name]
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

// ---------------------------------------------------------------- requests
/** A request body as JSON, and {} when it is not JSON - a client that posts a
 * form where the route wants JSON gets the missing-field answer rather than a
 * parse error. */
const readJson = async (request) => {
  try {
    return (await request.json()) || {}
  } catch (e) {
    return {}
  }
}

const badRequest = (message) => {
  const error = new Error(message)
  error.status = 400
  return error
}

/**
 * The value a route needs, or the 400 the server answers with when it is absent.
 * The message is Joi's, because that is what a client sees from the real API.
 */
const required = (value, name) => {
  if (typeof value === 'string' && value.length) return value
  throw badRequest(`"${name}" is required`)
}

/**
 * sasjs/server refuses a file path with one of these extensions (filePathSchema
 * in api/src/utils/validation.ts). Nothing is executable on a static host, but a
 * client that would be refused on deploy should hear it here too.
 */
const BLOCKED_FILE = /\.(exe|sh|htaccess)$/i

const fileTarget = (value, name) => {
  const given = required(value, name)
  if (BLOCKED_FILE.test(given)) throw badRequest('Invalid file extension')
  return given
}

/** The bytes of an uploaded file, from the multipart field the API names. */
const uploadBytes = async (request) => {
  const form = await request.formData().catch(() => null)
  const upload = form && form.get('file')
  if (!upload || typeof upload === 'string')
    throw badRequest('"file" is not present.')
  const target = form.get('filePath')
  return {
    bytes: new Uint8Array(await upload.arrayBuffer()),
    filePath: target === null ? undefined : target
  }
}

/**
 * Runs one drive mutation and then hands the page the entries it changed. The
 * worker can be terminated between requests, so a write is only durable once the
 * page has put it in IndexedDB.
 *
 * Await it at the call site: a bare `return driveResponse(...)` hands the
 * promise back through handle's try without running its catch, so a refused
 * write would reach the page as an unhandled rejection instead of its status.
 */
const driveResponse = async (runner) => {
  const result = runner()
  await persistChanges()
  return json(result)
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
      if (request.method === 'GET')
        return json(await R.list(query._folderPath || ''))

      if (request.method === 'POST') {
        const body = await readJson(request)
        return await driveResponse(() =>
          R.mkdir(required(body.folderPath, 'folderPath'))
        )
      }

      if (request.method === 'DELETE') {
        // an empty path names the drive root, which the server refuses at
        // validation rather than deleting everything
        const folderPath = required(query._folderPath, '_folderPath')
        return await driveResponse(() => R.rmdir(folderPath))
      }
    }

    if (path.endsWith('/SASjsApi/drive/filetree')) {
      return json(R.tree())
    }

    if (path.endsWith('/SASjsApi/drive/rename')) {
      if (request.method === 'POST') {
        const body = await readJson(request)
        const oldPath = required(body.oldPath, 'oldPath')
        const newPath = required(body.newPath, 'newPath')
        return await driveResponse(() => R.rename(oldPath, newPath))
      }
    }

    if (path.endsWith('/SASjsApi/drive/file')) {
      if (request.method === 'GET') {
        const file = R.read(query._filePath || '')
        return file.binary
          ? new Response(toBytes(file.contents), {
              headers: { 'content-type': 'application/octet-stream' }
            })
          : text(file.contents)
      }

      if (request.method === 'DELETE') {
        const filePath = fileTarget(query._filePath, '_filePath')
        return await driveResponse(() => R.remove(filePath))
      }

      // POST creates (409 when the path is taken) and PATCH replaces (404 when
      // it is not there) - the split the server's routes make, so a client that
      // keys on the status code behaves the same way
      if (request.method === 'POST' || request.method === 'PATCH') {
        const upload = await uploadBytes(request)
        const filePath = fileTarget(
          query._filePath || upload.filePath,
          '_filePath'
        )
        return await driveResponse(() =>
          request.method === 'PATCH'
            ? R.update(filePath, upload.bytes)
            : R.save(filePath, upload.bytes)
        )
      }
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
    // A drive refusal is the message itself, in plain text: the server answers
    // these with `res.status(code).send(err.message)`, and its own suite asserts
    // `res.text`. The other routes answer JSON, because a program failure
    // carries more than a message (`status`, `error`), so they keep the envelope.
    if (path.includes('/SASjsApi/drive/') && e && e.status)
      return text((e && e.message) || String(e), e.status)
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
