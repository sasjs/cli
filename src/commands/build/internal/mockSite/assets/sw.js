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
 * TRUST MODEL: this is a single-user host on the site's own origin. It answers
 * the API the way a SASjs server does, but there is no boundary behind it: a page
 * at this origin can already reach everything here, because a visitor's browser
 * is the client. The identity is the package's demo fixture (@sasjs/api's
 * `DEFAULT_IDENTITY`: `sasjsadmin` and `sasjsuser`, both `Orion123`), and a
 * request that carries no credential is read as the fixture administrator - the
 * visitor, on a host with no login wall. A site holding anything private, or one
 * served from a shared origin, belongs behind a real server rather than a static
 * host.
 *
 * The drive is persisted by the page (host/persist.js) and the identity is not:
 * an account, group, permission rule or client created through these routes
 * lives in this worker's memory, so a worker the browser terminates starts again
 * from the fixture. Edits that must survive a restart belong on a server. The
 * activity log the Admin routes report is in this worker's memory for the same
 * reason.
 *
 * Every operation in @sasjs/api's route table is answered here: the drive, the
 * sign-in flow, the records, the runs, the sessions, the diagnostics and logs,
 * the directory import, the app-stream delete, the linter and the home page. The
 * services are the package's; this file supplies the transport, the worker's own
 * activity, and the browser's answers to questions a server asks its process.
 */
importScripts('host/runtime-core.js')
importScripts('host/api-browser.js')
importScripts('host/lint-browser.js')

const R = self.SASjsMockRuntime

// @sasjs/api is the package sasjs/server answers with. Every route in its table
// is answered here from its services; what this file owns is the transport (a
// Request is not an ApiRequest), the work (a runner over the browser's drive)
// and the few capabilities a static origin does not have, which the package
// reports as a 501 naming the missing service.
const API = self.SASjsApi
// The linter, bundled at build time from the installed @sasjs/api/code and
// @sasjs/lint (see mockSite.ts). It is a separate script because the linter is
// not part of the root package a service worker can import.
const CODE = self.SASjsCode

const DRIVE_STORE = R.driveStore
const IDENTITY_STORE = new API.MemoryIdentityStore(API.DEFAULT_IDENTITY)
const IDENTITY = API.createIdentityService(IDENTITY_STORE)
const RECORDS = API.createRecordService(IDENTITY_STORE)

/**
 * The caller a request without a credential is talking as.
 *
 * This host has no login wall - that is its trust model, not an oversight - so
 * a page that does not sign in is not anonymous, it is the visitor. The fixture
 * administrator is the account the demo exists to give a client, and naming it
 * here keeps a mock site usable with no `/SASLogon/login` call. A request that
 * does carry a token is that token's subject, so the sign-in flow, the fixture's
 * two accounts and their permission rules all behave as the package decides.
 */
const IMPLICIT_CALLER = {
  userId: (API.DEFAULT_IDENTITY.users.find((user) => user.isAdmin) || {}).uid,
  clientId: ((API.DEFAULT_IDENTITY.clients || [])[0] || {}).clientId
}

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

const toBase64 = (bytes) => {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk)
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk))
  return btoa(binary)
}

const decoder = new TextDecoder()
const toText = (bytes) =>
  typeof bytes === 'string' ? bytes : decoder.decode(bytes)

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
 * The content type a session's header file is seeded with - the server's
 * default, not something the service asked for. The runtime owns the seed line,
 * so the value is taken from it rather than repeated here: a byte body that
 * carries only this type is an undeclared download, not a text/html one.
 */
const SEEDED_HEADER_LINE = String(R.HEADERS_SEED)

/**
 * The reply a run produced: the webout, in the shape and under the name the
 * service asked for. A debug reply is the webout framed with the log, so it
 * stays text - honouring a download there would put the frame in the file.
 *
 * The headers travel with the artefact rather than being applied here, because
 * both the execute answer and a triggered session's `/output` are that same
 * artefact: one place decides what a service declared, and the transport reads
 * it.
 */
const artifactOf = (result, debug) => {
  if (debug) {
    // webout SEP log SEP [listing] - the framing @sasjs/adapter and the Studio's
    // parser both split on, so a recorded session reads the same as a real one.
    const framed = [result.webout, LOGS_SEPARATOR, result.log, LOGS_SEPARATOR]

    if (result.print) framed.push(result.print)

    return {
      contents: framed.join('\n'),
      // the frame is text, and the service's own type and disposition are not
      // applied to it - a download there would put the frame in the file
      headers: { 'content-type': 'text/plain' },
      log: result.log
    }
  }

  const headers = parseHeaders(result.headers)
  let contents = result.webout
  if (result.binary) {
    // the seed is a default, so a byte body that leaves the seeded file untouched
    // declares nothing: it keeps the type an undeclared download gets. Compared as
    // the raw text rather than as the parsed value, so a service that declares
    // this same content type itself keeps it - only the untouched seed is dropped.
    if (String(result.headers) === SEEDED_HEADER_LINE)
      delete headers['content-type']
    if (!headers['content-type'])
      headers['content-type'] = 'application/octet-stream'
    contents = toBytes(result.webout)
  }
  return { contents, headers, log: result.log }
}

/** The response an artefact becomes, with the headers its service declared. */
const artifactResponse = (artifact) =>
  new Response(
    artifact.contents === undefined || artifact.contents === null
      ? ''
      : artifact.contents,
    { status: 200, headers: artifact.headers || {} }
  )

const broadcast = async (message) => {
  const clients = await self.clients.matchAll({ includeUncontrolled: true })
  clients.forEach((client) => client.postMessage(message))
}

const persistChanges = async () => {
  const files = R.takeDirty()
  if (Object.keys(files).length)
    await broadcast({ type: 'sasjs-persist', files })
}

// ----------------------------------------------------------- the SAS transcript
/**
 * A recorded SAS session, for a project that ships one.
 *
 * A browser has no SAS binary. Rather than let a Run on a .sas program be a
 * surprise, a project may record a session once and commit it as
 * `sas-transcript.json`: the build copies it into the site and this answers a
 * run of a program it names with that session's log, listing and webout. The
 * recording is the demo's own data, so nothing here is invented for a project
 * that does not ship one - those runs reach the runner and are refused exactly
 * as before.
 *
 * Shape: `{ "<program path>": {"log": "...", "print": "...", "webout": "..."} }`,
 * all three strings. The path is matched as written apart from the
 * `/sasjs/drive/files` prefix and the `.sas` suffix, so a recording keeps the
 * path a person sees; a bare file name is not enough, because that would answer
 * every file of that name in the drive.
 */
const SAS_TRANSCRIPT = 'host/sas-transcript.json'
let TRANSCRIPT = null

const transcript = async () => {
  if (TRANSCRIPT) return TRANSCRIPT
  try {
    const response = await fetch(SAS_TRANSCRIPT, { cache: 'no-cache' })
    TRANSCRIPT = response.ok ? await response.json() : {}
  } catch (e) {
    TRANSCRIPT = {}
  }
  return TRANSCRIPT
}

/**
 * The drive path without its mount prefix or extension.
 *
 * A recording is written with the path a person sees (`/sasjs/drive/files/...`,
 * ending in `.sas`); the route hands the request the path relative to the app,
 * and Studio asks for it without the extension. Comparing the logical path makes
 * those the same program without widening the match to the file name alone,
 * which would answer every `report.sas` in the drive with a session recorded for
 * some other file.
 */
const logicalPath = (value) =>
  String(value || '')
    .replace(/^\/sasjs\/drive\/files/i, '')
    .replace(/\.sas$/i, '')

/** The recording naming this program, if the project shipped one. */
const transcriptFor = async (programPath) => {
  const requested = logicalPath(programPath)
  if (!requested) return undefined

  const recorded = await transcript()

  for (const key of Object.keys(recorded))
    if (logicalPath(key) === requested) return recorded[key]

  return undefined
}

// ---------------------------------------------------------------- the runner
/**
 * The work a run does, over the browser's drive.
 *
 * `@sasjs/api` decides everything a client observes about a run - which
 * program, which run time, who may start it, the session record - and this
 * performs it. It is also the host's session store, because a session the
 * trigger route created has to be one the session routes can read: two maps
 * behind two ports would let a trigger write a record nothing can poll.
 */
class BrowserRuntime extends API.MemorySessionHost {
  constructor() {
    // no fixture sessions: every session this host reports was run here
    super({}, {}, {}, {})
  }

  async run(request) {
    const program = request.program || {}
    const params = Object.assign({}, request.vars || {})

    // A SAS program the recording does not name. This host has no SAS binary, so
    // the answer is the refusal a client already understands - not a JavaScript
    // SyntaxError quoting the SAS source, which is what handing it to the runner
    // would produce. The file is resolved because the request may name the
    // program without its extension.
    if (program.code === undefined) {
      const resolved = R.resolveProgram(program.path)

      if (resolved && /\.sas$/i.test(resolved))
        throw runFailure('"runTime" must be one of [js]')
    }

    const payload = { params, tables: tablesOf(request.files) }
    if (program.code !== undefined) payload.code = program.code
    else payload.program = program.path

    const result = R.run(payload)
    if (result.error) throw runFailure(result.error)

    const artifact = artifactOf(result, params._debug !== undefined)
    const session = request.session
    if (session) {
      const stamp = new Date().toISOString()
      const summary = {
        sessionId: session.sessionId,
        state: 'completed',
        creationTimeStamp: stamp,
        deathTimeStamp: stamp
      }
      if (session.expiresAfterMins !== undefined)
        summary.expiresAfterMins = {
          mins: session.expiresAfterMins,
          used: false
        }
      this.sessions[session.sessionId] = { owner: session.owner, summary }
      this.states[session.sessionId] = { state: 'completed' }
      this.logs[session.sessionId] = artifact.log || ''
      this.outputs[session.sessionId] = artifact
    }
    return { output: artifact }
  }
}

/**
 * A run that failed, as the service stringifies it.
 *
 * The runtime catches whatever the runner throws and answers its documented
 * `Job execution failed.` envelope with `String(error)`, so the message a
 * service's stack carries has to survive that call unchanged - a wrapper Error
 * would add its own prefix to a stack that already has one.
 */
const runFailure = (message) => {
  const error = new Error(message)
  error.toString = () => message
  return error
}

/**
 * The multipart files a request carried, as the runtime's `_WEBIN_*` tables.
 *
 * The field name is the table's name and the uploaded file's name is its
 * filename, which is what a stored program reads (`_WEBIN_NAME1`,
 * `_WEBIN_FILENAME1`, `_WEBIN_FILEREF1`). The package's transport carries the
 * bytes; the names are this host's, because they are the form the browser sent.
 */
const tablesOf = (files) => {
  if (!files) return []
  const list = Array.isArray(files)
    ? files
    : Object.keys(files).map((name) => ({ name, contents: files[name] }))
  return list.map((file, index) => ({
    name: file.name || `file${index + 1}`,
    filename: file.filename || file.name || `file${index + 1}`,
    csv: toText(file.csv !== undefined ? file.csv : file.contents)
  }))
}

const RUNTIME = new BrowserRuntime()

/**
 * The folder this site is served from.
 *
 * Empty at the origin root, `/demo` where a host publishes the demonstration
 * site beside its own docs. The worker sits at `<base>/sw.js`, so its own
 * location names the base and the route table can keep matching the paths the
 * document states.
 */
const BASE = (self.location.pathname || '').replace(/\/sw\.js.*$/, '')

/**
 * The short spelling of the App Stream landing page.
 *
 * It is the default: the interface links to `/app`, and sasjs/server serves it
 * there while keeping `/AppStream` as a redirect. The worker mirrors that, so a
 * link the interface builds reaches the same page on the static demo.
 */
const SHORT_APP_STREAM_PATH = '/app'

const withoutBase = (pathname) =>
  BASE && pathname.startsWith(BASE)
    ? pathname.slice(BASE.length) || '/'
    : pathname

// ------------------------------------------------------------- host reports
// The Admin routes ask a host what it is doing. A browser has no process, but it
// does have a page, a heap and this worker's own activity, so the reports are
// built from those rather than refused: the request log below is the log file,
// and the memory reading is `performance.memory` where the browser exposes it.
const STARTED = Date.now()
const HOST_LOG_LIMIT = 2000
const HOST_LOG = []
const LOG_FILE = 'app.log'
// the moment the last line was written, which is the file's mtime - not the
// moment a report read it
let LOG_UPDATED = null

const logEntry = (line) => {
  LOG_UPDATED = new Date().toISOString()
  HOST_LOG.push(`${LOG_UPDATED} ${line}`)
  if (HOST_LOG.length > HOST_LOG_LIMIT)
    HOST_LOG.splice(0, HOST_LOG.length - HOST_LOG_LIMIT)
}

const logText = () => HOST_LOG.join('\n')
const bytesOf = (text) => new TextEncoder().encode(String(text)).length

const adminReports = {
  diagnostics: async () => {
    const perf = self.performance || {}
    const heap = perf.memory || {}
    const deviceBytes = Number(navigator.deviceMemory || 0) * 1024 ** 3
    const total = Number(heap.jsHeapSizeLimit || deviceBytes || 0)
    const used = Number(heap.usedJSHeapSize || 0)
    return {
      build: { version: 'dev', gitHash: 'unknown', buildDate: null },
      server: {
        // a page is not a process: the fields exist so a diagnostics screen
        // renders, and their values describe this worker rather than inventing
        // one behind it
        mode: 'browser',
        uptimeSeconds: (Date.now() - STARTED) / 1000,
        startedAt: new Date(STARTED).toISOString(),
        pid: 0,
        nodeVersion: 'n/a',
        platform: navigator.platform || 'browser',
        arch: 'browser',
        cpuCount: navigator.hardwareConcurrency || 1,
        cpuModel: 'unknown',
        loadAverage: [],
        runTimes: ['js', 'sas'],
        sasjsRoot: '/'
      },
      memory: {
        rssBytes: used,
        heapTotalBytes: total,
        heapUsedBytes: used,
        externalBytes: 0,
        systemTotalBytes: deviceBytes || total,
        systemFreeBytes: Math.max(0, (deviceBytes || total) - used)
      },
      // a static origin cannot read the device's filesystem, which the document
      // allows the host to state
      filesystem: null,
      folders: [],
      logs: {
        folder: 'worker memory',
        // no file until a request has written one, and the stamp is the last
        // write rather than the moment this report was assembled
        fileCount: HOST_LOG.length ? 1 : 0,
        totalBytes: bytesOf(logText()),
        newestFile: HOST_LOG.length ? LOG_FILE : null,
        newestModified: LOG_UPDATED
      }
    }
  },
  logs: async () =>
    HOST_LOG.length
      ? [
          {
            name: LOG_FILE,
            sizeBytes: bytesOf(logText()),
            modified: LOG_UPDATED
          }
        ]
      : [],
  logTail: async (fileName, lines) => {
    if (fileName !== LOG_FILE || !HOST_LOG.length) return undefined
    const tail = HOST_LOG.slice(-lines)
    const content = tail.join('\n')
    return {
      fileName,
      lines: tail.length,
      bytesRead: bytesOf(content),
      truncated: tail.length < HOST_LOG.length,
      content
    }
  }
}

/**
 * The directory the LDAP import reads.
 *
 * A browser has no bind to make, so the source is the fixture this host already
 * signs in with: every account and group it names is present, so the import
 * answers the route (the package owns the idempotency) and creates nothing. A
 * host with a real directory supplies its own source.
 */
const directorySource = {
  users: async () =>
    API.DEFAULT_IDENTITY.users.map((user) => ({
      username: user.username,
      displayName: user.displayName
    })),
  groups: async () =>
    API.DEFAULT_IDENTITY.groups.map((group) => ({
      name: group.name,
      members: group.users || []
    }))
}

/**
 * The app streams this host published: the site itself.
 *
 * The folder is the identity, so unpublishing the app the site was built for
 * answers `success`; any other folder is the documented 404. The static files
 * stay where they are - a worker cannot delete the site it is served from - so
 * this is a record of the publication, not a filesystem operation.
 */
let registryPromise
const registry = () => {
  if (!registryPromise)
    registryPromise = (async () => {
      let appLoc
      try {
        const config = await (await fetch('host/mock-config.json')).json()
        appLoc = config && config.appLoc
      } catch (e) {
        appLoc = undefined
      }
      return new API.MemoryAppStreamRegistry(appLoc ? [appLoc] : [])
    })()
  return registryPromise
}

/**
 * The page at `/`.
 *
 * The site's own index.html is already in the build, so the home route reads it
 * from the static host and hands the package the page and a token of its
 * contents. The package decides what to do with the token; these builds do not
 * reference `index.bundle.js`, so in practice it is returned unchanged.
 */
const contentVersion = (text) => {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16)
}

const homeService = API.createHomeService(async () => {
  try {
    const response = await fetch('index.html', { cache: 'no-store' })
    if (!response.ok) return undefined
    const html = await response.text()
    return { html, version: contentVersion(html) }
  } catch (e) {
    return undefined
  }
})

const SERVICES = {
  drive: API.createDriveService(DRIVE_STORE),
  info: API.createInfoService(API.BROWSER_INFO),
  identity: IDENTITY,
  records: RECORDS,
  runtime: API.createRuntimeService(IDENTITY_STORE, RUNTIME, {
    // `js` is executed here; `sas` is offered so a SAS program can be run at all
    // in the demo, and answered from the recording when one names it. A `.sas`
    // program with no recording is refused in the runner, deliberately - it must
    // not be handed to the JavaScript runtime as source, which is what the
    // resolveProgram guard in BrowserRuntime.run prevents.
    runTimes: ['js', 'sas']
  }),
  session: API.createSessionService(IDENTITY_STORE, RUNTIME),
  authConfig: API.createAuthConfigService({}),
  admin: API.createAdminService(adminReports),
  directory: API.createDirectoryService(IDENTITY_STORE, directorySource),
  registry: {
    unpublish: async (appLoc) => (await registry()).unpublish(appLoc)
  },
  home: homeService,
  // the package's own code service over the bundled linter; the host passes no
  // lint config, so a buffer is linted against the linter's defaults - a mock
  // has no `.sasjslint` tree to resolve one from
  code: CODE.createCodeService({})
}

/** The routes this host performs itself, because the answer is not JSON. */
const RUN_ROUTES = new Set([
  'GET /SASjsApi/stp/execute',
  'POST /SASjsApi/stp/execute',
  'POST /SASjsApi/stp/trigger',
  'POST /SASjsApi/code/execute',
  'POST /SASjsApi/code/trigger'
])

const SESSION_OUTPUT = 'GET /SASjsApi/session/{sessionId}/output'
const DEPLOY_UPLOAD = 'POST /SASjsApi/drive/deploy/upload'

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
  const error = new API.ApiError(400, message)
  return error
}

const payloadTooLarge = (limit) => {
  return new API.ApiError(
    413,
    `The upload is larger than the browser host allows (${Math.round(
      limit / (1024 * 1024)
    )} MB).`
  )
}

/**
 * A JSON body, unwrapped from the envelope the page bridge posts.
 *
 * `host/intercept.js` turns an XHR body into `{ params, tables }` before it
 * reaches the worker: reading a multipart body from an XHR-originated request is
 * unreliable in a worker, so the page - where a FormData is trivial - does it.
 * That envelope is this build's own wire format for page traffic, and a client
 * that posts JSON directly (a `fetch` from the console, a test) sends its fields
 * flat, so both shapes are read.
 */
const readJsonBody = async (request) => {
  const body = await readJson(request)

  // The bridge forwards a JSON body as `json` - a request the page made with
  // `JSON.stringify` has no fields for the envelope it wraps everything in, so
  // the payload is the whole point of the message. Reading only `params` here
  // dropped it: `code/execute` and `code/lint` arrived with no code.
  if (
    body &&
    typeof body === 'object' &&
    body.json &&
    typeof body.json === 'object'
  )
    return { body: body.json, files: [] }

  if (
    body &&
    typeof body === 'object' &&
    !Array.isArray(body) &&
    Array.isArray(body.tables) &&
    body.params &&
    typeof body.params === 'object'
  ) {
    return {
      body: body.params,
      files: body.tables.map((table, index) => ({
        name: table.name || `table${index + 1}`,
        filename:
          table.filename || `${table.name || 'table' + (index + 1)}.csv`,
        // A file the bridge could not read as UTF-8 travels as base64 with a
        // flag: writing its text would replace the bytes and store the damage
        // under a success status, which is what a binary upload used to do.
        contents:
          table.csv === undefined
            ? ''
            : table.binary
              ? toBytes(table.csv)
              : table.csv
      }))
    }
  }
  return { body, files: [] }
}

/**
 * A request's payload: the form fields as a body, and the files apart from them.
 *
 * The two have to be separated here rather than in the package: a multipart
 * body is the transport's, and the API names a file by a field the host reads.
 */
const readPayload = async (request, allowLargeFile = false) => {
  const parsed = { body: {}, files: [] }
  if (request.method === 'GET' || request.method === 'HEAD') return parsed
  const type = request.headers.get('content-type') || ''
  if (!type.includes('multipart/form-data')) return await readJsonBody(request)
  const form = await request.formData().catch(() => null)
  if (!form) return parsed
  for (const [name, value] of form.entries()) {
    if (typeof value === 'string') {
      parsed.body[name] = value
      continue
    }
    // refused from the File's size, before the body is read: a worker holds the
    // whole payload in memory, so an oversized upload there is an out-of-memory
    // failure rather than an answer a client can act on. The deploy archive is
    // the exception - the package measures the tree it expands to, which is the
    // cap the document states for that route - and it is read here to be
    // expanded before that measurement can run.
    if (
      !allowLargeFile &&
      typeof value.size === 'number' &&
      value.size > R.MAX_UPLOAD_BYTES
    )
      throw payloadTooLarge(R.MAX_UPLOAD_BYTES)
    parsed.files.push({
      name,
      filename: value.name || name,
      contents: new Uint8Array(await value.arrayBuffer())
    })
  }
  return parsed
}

/**
 * The multipart file the API names `file`, for the routes that take one.
 *
 * Every route that carries a single file names the field `file`; the deploy
 * upload is the exception, because its archive is expanded into a tree before
 * the drive sees it.
 */
const singleFile = (parsed) => {
  const match =
    parsed.files.find((file) => file.name === 'file') || parsed.files[0]
  if (!match) return undefined
  return { name: match.filename, contents: match.contents }
}

/**
 * The content type `sendFile` would answer with for this path - by extension,
 * because that is what express does, and because a byte entry would otherwise be
 * served as `application/octet-stream` however text-like it is.
 */
const CONTENT_TYPES = {
  '.csv': 'text/csv',
  '.json': 'application/json',
  '.sas': 'text/plain',
  '.txt': 'text/plain',
  '.log': 'text/plain',
  '.html': 'text/html',
  '.htm': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.zip': 'application/zip',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.xls': 'application/vnd.ms-excel',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml'
}

const contentTypeFor = (filePath, binary) => {
  const name = String(filePath || '').toLowerCase()
  const dot = name.lastIndexOf('.')
  const known = dot > 0 ? CONTENT_TYPES[name.slice(dot)] : undefined
  if (known) return known
  return binary ? 'application/octet-stream' : 'text/plain'
}

// ------------------------------------------------------------- a deployment
/**
 * The members of a zip archive, as the deploy route's tree.
 *
 * The server's transport is multer plus a zip library; a worker has
 * `DecompressionStream`, so parsing the archive is this host's. Only the two
 * methods a deploy archive uses are read - stored and deflate - and anything
 * else is refused by name rather than half-expanded.
 *
 * Directory entries are dropped and a folder is derived from the members'
 * names, which is how the tree the server builds from the same archive is
 * shaped.
 */
const unzip = async (bytes) => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const u16 = (at) => view.getUint16(at, true)
  const u32 = (at) => view.getUint32(at, true)

  // the end-of-central-directory record is the last signature in the file, and
  // it sits within 22 + 65535 bytes of the end (a comment is the only tail)
  let eocd = -1
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (u32(i) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw badRequest('The archive is not a zip file.')

  const count = u16(eocd + 10)
  let offset = u32(eocd + 16)

  const entries = []
  for (let n = 0; n < count; n++) {
    if (u32(offset) !== 0x02014b50)
      throw badRequest('The archive is not a zip file.')
    const method = u16(offset + 10)
    const compressedSize = u32(offset + 20)
    const nameLength = u16(offset + 28)
    const extraLength = u16(offset + 30)
    const commentLength = u16(offset + 32)
    const localOffset = u32(offset + 42)
    const name = decoder.decode(
      bytes.subarray(offset + 46, offset + 46 + nameLength)
    )
    offset += 46 + nameLength + extraLength + commentLength

    if (name.endsWith('/')) continue
    if (u32(localOffset) !== 0x04034b50)
      throw badRequest('The archive is not a zip file.')
    const start =
      localOffset + 30 + u16(localOffset + 26) + u16(localOffset + 28)
    const data = bytes.subarray(start, start + compressedSize)

    let contents
    if (method === 0) contents = data
    else if (method === 8) {
      const stream = new Blob([data])
        .stream()
        .pipeThrough(new DecompressionStream('deflate-raw'))
      contents = new Uint8Array(await new Response(stream).arrayBuffer())
    } else
      throw badRequest(
        `The archive uses compression method ${method}, which this host does not read.`
      )
    entries.push({ name, contents })
  }
  return entries
}

/** The nested tree the deploy route writes, from the archive's member names. */
const deployTree = (entries) => {
  const root = { members: [] }
  const folders = { '': root }
  const folderFor = (path) => {
    if (folders[path]) return folders[path]
    const cut = path.lastIndexOf('/')
    const parent = folderFor(cut < 0 ? '' : path.slice(0, cut))
    const name = cut < 0 ? path : path.slice(cut + 1)
    const folder = { name, type: 'folder', members: [] }
    parent.members.push(folder)
    folders[path] = folder
    return folder
  }
  entries.forEach((entry) => {
    const cut = entry.name.lastIndexOf('/')
    const parent = folderFor(cut < 0 ? '' : entry.name.slice(0, cut))
    parent.members.push({
      name: cut < 0 ? entry.name : entry.name.slice(cut + 1),
      type: 'file',
      code: toBase64(entry.contents)
    })
  })
  return root
}

// ---------------------------------------------------------------- the routes
/** The subject a request is talking as, from its bearer token or the implicit
 * caller when it carries none. An unknown token is the package's 401. */
const subjectOf = async (request, query) => {
  const header = request.headers.get('authorization') || ''
  const token =
    header.replace(/^Bearer\s+/i, '').trim() ||
    String(query.access_token || '').trim() ||
    undefined
  if (!token) return IMPLICIT_CALLER
  const subject = await IDENTITY.authenticate(token)
  if (!subject) throw new API.ApiError(401, 'Unauthorized')
  return subject
}

/**
 * One run, answered by the runtime service.
 *
 * The service is called directly rather than through `dispatch` because a run's
 * answer is the webout *with the headers its service declared*
 * (`content-disposition` is how a service names a download), and the artefact
 * the service returns is where those headers are. Everything a client observes
 * about the request - who may run it, which field names the program, what
 * `_debug` means - is still the package's decision.
 */
const runRoute = async (routeId, payload, subject) => {
  const query = payload.query
  const body = payload.body
  const tables = payload.files.map((file) => ({
    name: file.name,
    filename: file.filename,
    csv: toText(file.contents)
  }))
  const code =
    routeId.endsWith('/code/execute') || routeId.endsWith('/code/trigger')
  const trigger = routeId.endsWith('/trigger')
  const vars = Object.assign({}, query, body)

  const runRequest = {
    source: code ? 'code' : 'program',
    vars,
    files: tables
  }
  if (code) {
    runRequest.code = body.code
    runRequest.runTime = body.runTime
  } else {
    // the query wins over the body, which is the order the server resolves them in
    runRequest.program = query._program || body._program
  }

  // A recorded SAS session is answered here, ahead of the run time check: a
  // transcript is data, not a run time, and this host holds only `js`. Accepting
  // `sas` instead would make the package compile SAS source as JavaScript and
  // hand back a SyntaxError where every other .sas program gets a refusal.
  // Neither a code run nor a trigger: a trigger has to answer with the session
  // record the route builds, which a client parses as JSON, so a recording is not
  // an answer there.
  if (!code && !trigger) {
    const recording = await transcriptFor(runRequest.program)

    if (recording)
      return artifactResponse(
        artifactOf(
          {
            webout: recording.webout || '',
            log: recording.log || '',
            print: recording.print || '',
            // the seed every session starts with, so a run without `_debug`
            // answers text/html rather than leaving the type to the browser -
            // the same rule runtime-core applies to a service that declares none
            headers: SEEDED_HEADER_LINE
          },
          vars._debug !== undefined
        )
      )
  }

  if (trigger) {
    runRequest.expiresAfterMins =
      query.expiresAfterMins !== undefined
        ? query.expiresAfterMins
        : body.expiresAfterMins
    const answer = await SERVICES.runtime.trigger(subject, runRequest)
    await persistChanges()
    return json(answer, 200)
  }

  const artifact = await SERVICES.runtime.execute(subject, runRequest)
  await persistChanges()
  return artifactResponse(artifact)
}

/**
 * A triggered session's output, from the session service.
 *
 * Called directly for the same reason as a run: the artefact carries the content
 * type and disposition its service declared, and a JSON-shaped answer would lose
 * them.
 */
const outputRoute = async (request, params, subject) => {
  const artifact = await SERVICES.session.output(subject, params.sessionId)
  return artifactResponse(artifact)
}

/** The response a `contents` answer becomes, typed by the path it names. */
const contentsResponse = (answer, path) => {
  const binary = typeof answer.contents !== 'string'
  return new Response(answer.contents, {
    status: answer.status,
    headers: { 'content-type': contentTypeFor(path, binary) }
  })
}

const routeRequest = async (request, url) => {
  const path = withoutBase(url.pathname).replace(/\/+$/, '') || '/'
  // `/api` is the short spelling of the API, and `/SASjsApi` the canonical one:
  // both are answered, so the alias is stripped once here and everything below -
  // the route lookup, the drive routes' plain-text refusals, the log - works
  // from one path.
  const apiPath = path.replace(/^\/api(?=\/|$)/i, '/SASjsApi')
  const query = {}
  for (const [k, v] of url.searchParams.entries()) query[k] = v

  try {
    await R.ensureReady()

    // The app stream is the server's own web surface rather than part of the
    // API: the listing, the landing page and the redirect from one to the other
    // are routes sasjs/server answers, and an interface asks for the listing on
    // every visit. Unanswered, those requests reach the static host and the page
    // parses this site's index.html as JSON.
    //
    // `/app` is the spelling the interface links to and the server serves; the
    // canonical `/AppStream` still answers, because a client built before the
    // short paths existed asks for it. The answers are the same either way, so
    // `/AppStream` redirects to `/app` - exactly as the server redirects it -
    // and the landing page, the listing and the missing-name refusal are decided
    // on both.
    //
    // The listing is empty rather than read from `registry()`, which records this
    // deployment's own folder so the delete route has something to remove: the
    // stream really does serve nothing at `/app/<name>/` here, and a listing that
    // named it would offer a tile that 404s.
    // `path` has its trailing slashes stripped, and the landing answers differ by
    // exactly that, so they are decided on the request's own pathname - minus the
    // folder the site is served from, which the patterns do not name.
    const stream = withoutBase(url.pathname)

    if (/^\/AppStream$/i.test(stream))
      return new Response(null, {
        status: 301,
        headers: { location: `${BASE}${SHORT_APP_STREAM_PATH}` }
      })

    if (
      /^\/(app|AppStream)\/?$/i.test(stream) ||
      /^\/(app|AppStream)\/index\.html$/i.test(stream)
    )
      return new Response(
        [
          '<!doctype html><html><head><meta charset="utf-8">',
          '<title>App Stream</title></head><body>',
          '<h1>SASjs App Stream</h1>',
          '<p>This browser host serves no apps: nothing is published on a static site.</p>',
          '</body></html>'
        ].join(''),
        { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } }
      )

    if (/^\/(app|AppStream)\/apps\.json$/i.test(stream))
      return json({ apps: [] })

    if (/^\/(app|AppStream)\//i.test(stream)) {
      return json(
        {
          message:
            'This browser host serves no apps: nothing is published on a static site.'
        },
        404
      )
    }

    // The package's own matcher, so a route is recognised however its path is
    // cased and its parameters are read the way the document states them.
    const matched = API.findRoute(request.method, apiPath)
    if (!matched)
      return json({ message: 'Not part of the API: ' + apiPath }, 404)

    const routeId = matched.route.id
    const subject = await subjectOf(request, query)
    const payload = await readPayload(request, routeId === DEPLOY_UPLOAD)
    payload.query = query

    if (RUN_ROUTES.has(routeId))
      return await runRoute(routeId, payload, subject)

    const apiRequest = {
      query,
      params: matched.params,
      subject,
      body: payload.body
    }
    const file = singleFile(payload)
    if (file) apiRequest.file = file
    if (payload.files.length > 1) apiRequest.files = payload.files

    if (routeId === SESSION_OUTPUT)
      return await outputRoute(request, matched.params, subject)

    // The upload route's transport is the archive: it is expanded here and the
    // drive is handed the same tree the JSON route takes.
    if (routeId === DEPLOY_UPLOAD) {
      if (!payload.files.length) throw badRequest('"file" is not present.')
      const entries = await unzip(payload.files[0].contents)
      apiRequest.body = Object.assign({}, payload.body, {
        fileTree: deployTree(entries)
      })
    }

    const answer = await API.dispatch(SERVICES, routeId, apiRequest)
    if (request.method !== 'GET') await persistChanges()

    // the shell is a page, not a file the caller named: the document states
    // text/html for it, and the extension of `/` says nothing
    if (routeId === 'GET /')
      return new Response(answer.contents, {
        status: answer.status,
        headers: { 'content-type': 'text/html; charset=utf-8' }
      })

    if (answer.contents !== undefined)
      return contentsResponse(
        answer,
        query._filePath || payload.body.filePath || path
      )
    return json(answer.body, answer.status)
  } catch (e) {
    const message = (e && e.stack) || String(e)
    const status = (e && e.status) || 500
    const refusal = status >= 400 && status < 500

    // A 4xx is an ANSWER: the API decided, the caller was told, and a client
    // that expected it (Studio creates its default program and accepts the 409)
    // has already handled it. Broadcasting it put four console errors on a page
    // whose only fault was opening a file that was already there. A 5xx is the
    // host failing, and that is worth reporting to the page.
    logEntry(
      `${request.method} ${path} ${refusal ? 'refused' : 'ERROR'} ${
        (e && e.message) || message
      }`
    )

    if (!refusal) broadcast({ type: 'sasjs-host-error', path, message })
    // A refusal the API decided on carries its status and, where the route
    // answers an envelope, the body to send. The drive's routes send the message
    // itself as plain text - the server answers them with `res.status(code)
    // .send(err.message)` - so those stay text; everything else keeps the JSON
    // envelope the other routes already answer with.
    if (API.isApiError(e)) {
      if (e.body !== undefined) return json(e.body, e.status)
      if (apiPath.includes('/SASjsApi/drive/')) return text(e.message, e.status)
      return json({ message: e.message }, e.status)
    }
    return json(
      { message: (e && e.message) || String(e) },
      (e && e.status) || 500
    )
  }
}

/**
 * One request, answered and written to the host's activity log.
 *
 * The log is what the Admin routes report: a browser has no server log file, so
 * the worker keeps its own - method, path, status and how long it took - and the
 * three admin routes read it back.
 */
const handle = async (request, url) => {
  const started = Date.now()
  const response = await routeRequest(request, url)
  logEntry(
    `${request.method} ${url.pathname} ${response.status} ${
      Date.now() - started
    }ms`
  )
  return response
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (url.origin !== self.location.origin) return
  const path = withoutBase(url.pathname)

  // The site's own page is answered by the home route, but a navigation must
  // never be at the API's mercy: if that route throws or answers an error, the
  // request falls back to the static host, which holds the same index.html. A
  // broken API route can cost a client its data; it must not cost the app its
  // page.
  if (path === '/') {
    event.respondWith(
      (async () => {
        try {
          const response = await handle(event.request, url)
          if (response && response.status < 400) return response
        } catch (e) {
          /* fall through to the static host */
        }
        return fetch(event.request)
      })()
    )
    return
  }

  // The host's own paths are answered here, including one the table does not
  // have - falling through to the static host would put the SPA's index.html
  // behind a typo in a caller's URL, or behind a listing an interface parses as
  // JSON. `/app` is one of those: the package serves app deployments, but the
  // listing is the server's web route, and an interface that lists apps asks for
  // it on every visit.
  //
  // `/api` and `/api/` on their own are the API's documentation page - a file
  // the build copies into the site - so the worker stays out of the way there
  // and the static host answers it. Every other `/api/...` is an API call on the
  // short spelling, which routeRequest canonicalises to `/SASjsApi`.
  if (/^\/api\/?$/i.test(path)) return

  if (!/^\/(SASjsApi|SASLogon|AppStream|api|app)(\/|$)/i.test(path)) return
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
