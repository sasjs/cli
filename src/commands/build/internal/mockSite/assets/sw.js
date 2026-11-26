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
 * is the client. The identity is a fixture the build ships as `host/identity.json`
 * (@sasjs/api's demo fixture unless the project supplies its own: `sasjsadmin`
 * and `sasjsuser`, both `Orion123`), and a request that carries no credential is
 * read as the fixture administrator - the visitor, on a host with no login wall.
 * The subject is switchable (`window.SASjsMock.as('sasjsuser')`) so a reviewer can
 * see the refusals a restricted account gets. Passwords are plain text in the
 * fixture and tokens are opaque strings nobody signs: this is a fixture, not an
 * identity provider, and a site holding anything private, or one served from a
 * shared origin, belongs behind a real server rather than a static host.
 *
 * The drive and the identity are both persisted by the page (host/persist.js): an
 * account, group, permission rule or client created through these routes survives
 * a reload because the page stores the store's own snapshot, and a visitor who
 * chose a subject stays that subject. The activity log the Admin routes report is
 * in this worker's memory, so it restarts with the worker.
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

const DRIVE_STORE = R.driveStore

/**
 * The identity this site signs in with.
 *
 * It ships as `host/identity.json`, which the build writes from the package's
 * demo fixture unless the project drops a `mock-identity.json` beside the build.
 * One file, one load path: the runtime reads the fixture rather than holding an
 * object literal, so the documented format is the one in use, a project replaces
 * it without touching this file, and which fixture wins is decided at build time
 * rather than at run time.
 *
 * The store sits behind a port because everything below is built once, while the
 * fixture arrives after this module is evaluated (it is a fetch). `SERVICES`,
 * `IDENTITY` and `RECORDS` therefore speak to whichever store is current, which
 * is what lets a boot replace the fixture, `as()` re-point the caller, and
 * `reset()` put the shipped one back.
 */
const IDENTITY_FILE = 'host/identity.json'

/**
 * The public OAuth client every Viya deployment ships, and the one
 * `@sasjs/adapter` falls back to when a target names no client.
 *
 * It is never a fixture entry: a client record carries a secret and this one has
 * none, which is why `@sasjs/api` resolves it from the store as a rule while
 * leaving the administration listing to the fixture. sasjs/server binds its
 * password grant, and the refresh that follows, to this exact id with an empty
 * secret.
 */
const PUBLIC_CLIENT_ID = 'sas.cli'

const IDENTITY_STATE = {
  store: new API.MemoryIdentityStore(API.DEFAULT_IDENTITY),
  /**
   * The secrets the current fixture declares, kept beside the store rather than
   * read back from it: the store's read path omits a client's secret, and its
   * snapshot is an inspection aid rather than the port a credential is checked
   * through.
   */
  secrets: new Map(
    (API.DEFAULT_IDENTITY.clients || []).map((client) => [
      client.clientId,
      client.clientSecret
    ])
  ),
  /** The fixture the store last reported to the page, as JSON. */
  persisted: '',
  /** The fixture the build shipped; `reset()` returns to this one. */
  shipped: null,
  /** True once a fixture has been seeded, so a boot is not overwritten. */
  seeded: false
}

const IDENTITY_STORE = new Proxy(
  {},
  {
    get:
      (_target, method) =>
      (...args) =>
        IDENTITY_STATE.store[method](...args)
  }
)
const IDENTITY = API.createIdentityService(IDENTITY_STORE)
const RECORDS = API.createRecordService(IDENTITY_STORE)

const adminUser = () =>
  IDENTITY_STATE.store.snapshot().users.find((user) => user.isAdmin)

const firstClient = () => (IDENTITY_STATE.store.snapshot().clients || [])[0]

/**
 * The caller a request without a credential is talking as.
 *
 * This host has no login wall - that is its trust model, not an oversight - so
 * a page that does not sign in is not anonymous, it is the visitor. `undefined`
 * is the fixture's administrator, a username is that account, and `null` means
 * no caller at all: the last is how the conformance corpus asks for the answers
 * an anonymous request gets, which a static host otherwise never produces.
 * Naming the account here keeps a mock site usable with no `/SASLogon/login`
 * call, while giving `as()` something to change.
 */
let CALLER_USERNAME
let IMPLICIT_CALLER

/** Names the caller from the current fixture, resolving it to a subject. */
const resolveCaller = () => {
  const user =
    CALLER_USERNAME === null
      ? undefined
      : CALLER_USERNAME === undefined
        ? adminUser()
        : IDENTITY_STATE.store
            .snapshot()
            .users.find((candidate) => candidate.username === CALLER_USERNAME)

  const client = firstClient()

  IMPLICIT_CALLER =
    user && client ? { userId: user.uid, clientId: client.clientId } : undefined
}

const seedIdentity = (fixture) => {
  IDENTITY_STATE.store = new API.MemoryIdentityStore(fixture)
  IDENTITY_STATE.persisted = JSON.stringify(IDENTITY_STATE.store.snapshot())
  // rebuilt with the store, against the invariant the initialiser documents
  IDENTITY_STATE.secrets = new Map(
    (fixture.clients || []).map((client) => [
      client.clientId,
      client.clientSecret
    ])
  )
  IDENTITY_STATE.seeded = true
  resolveCaller()
}

/**
 * The fixture the build ships, read once from the site.
 *
 * A build always writes the file, so a malformed one is refused by name: a
 * store seeded from a fixture whose format this package cannot read would answer
 * the sign-in flow with accounts it half-understands. An ABSENT file is the one
 * case that falls back - a site deployed from a build before the fixture existed
 * still runs, as the demo fixture, with the fact written to the host log rather
 * than passing silently.
 */
let SHIPPED = null
const shippedIdentity = () => {
  if (!SHIPPED)
    SHIPPED = (async () => {
      const response = await fetch(IDENTITY_FILE, { cache: 'no-store' })

      if (!response.ok) {
        logEntry(
          `identity ${IDENTITY_FILE} answered ${response.status}: using the packaged demo fixture`
        )
        IDENTITY_STATE.shipped = API.DEFAULT_IDENTITY
        return IDENTITY_STATE.shipped
      }

      const raw = await response.json()
      try {
        IDENTITY_STATE.shipped = API.parseIdentity(raw)
      } catch (e) {
        throw new Error(
          `${IDENTITY_FILE} cannot be used: ${(e && e.message) || String(e)}`
        )
      }
      return IDENTITY_STATE.shipped
    })()
  return SHIPPED
}

let IDENTITY_READY = null
/** The identity is usable once a fixture has been seeded. */
const ensureIdentity = () => {
  if (!IDENTITY_READY)
    IDENTITY_READY = shippedIdentity().then((fixture) => {
      if (!IDENTITY_STATE.seeded) seedIdentity(fixture)
      return fixture
    })
  return IDENTITY_READY
}

/**
 * Boots the identity the page hands over: the fixture it persisted (a store
 * written by an older build is refused by name by `parseIdentity`) and the
 * subject the visitor last chose.
 */
const bootIdentity = async (data) => {
  await ensureIdentity()

  let fixture = IDENTITY_STATE.shipped

  if (data.identity) {
    try {
      fixture = API.parseIdentity(data.identity)
    } catch (e) {
      // tagged so the page can tell a fixture IT cannot read (which it drops)
      // from the host failing for some other reason (which it must not)
      const rejected = new Error((e && e.message) || String(e))
      rejected.identityRejected = true
      throw rejected
    }
  }

  // a subject the fixture does not declare is refused rather than answered as
  // the administrator: taking the name anyway would answer every request as
  // `emulated-user`, and falling back to the administrator would hide a typo, a
  // stale shared link, or a test that meant to be someone else. `undefined` stays
  // the fresh-boot case - no session, so the administrator, the same answer a
  // request with no session gets (see `resolveCaller`).
  const named = data.subject === undefined ? undefined : data.subject

  if (
    named !== null &&
    named !== undefined &&
    !fixture.users.some((user) => user.username === String(named))
  ) {
    // tagged so the page can clear the account it stored without dropping the
    // fixture, which is fine; `SASjsMock.as()` sees the error itself
    const refused = new Error(`No account '${named}' in the identity fixture`)
    refused.callerRejected = true
    throw refused
  }

  CALLER_USERNAME =
    named === null ? null : named === undefined ? undefined : String(named)

  seedIdentity(fixture)
}

const LOGS_SEPARATOR = 'SASJS_LOGS_SEPARATOR_163ee17b6ff24f028928972d80a26784'
const SAS9_FRAME = Symbol('sas9-frame')
const TIER_FRAME = Symbol('tier-frame')
const EXECUTION_FRAME = Symbol('execution-frame')

// The server frames a tier run only when its normalized debug level is >= 131.
// Its parseDebugValue maps every nonempty, non-integer string (including 1e3
// and 0x10) to 131, so these values enable framing rather than being parsed as
// numbers. Whitespace-only values remain absent.
const tierDebugOn = (value) => {
  if (value === undefined || value === null || value === '') return false
  if (typeof value === 'number') return Number.isFinite(value) && value >= 131
  const text = String(value).trim()
  if (!text) return false
  return /^[+-]?\d+$/.test(text) ? Number(text) >= 131 : true
}

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) =>
  event.waitUntil(self.clients.claim())
)

/**
 * The host's refusal when a request names both tier parameters.
 *
 * The one other copy is the sentence sasjs/server mints on the same two
 * parameters (`api/src/routes/setupRoutes.ts`, `TIER_NEEDS_ONE_PARAMETER`).
 * The mock answers as the host answers, so the wording has to match: a spec on
 * each side asserts the sentence itself rather than the constant, so a change
 * to either copy fails there instead of drifting quietly.
 */
const TIER_NEEDS_ONE_PARAMETER =
  'Exactly one of "_program" and "_FILE" may be given.'

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
const artifactOf = (result, debug, sas9 = false) => {
  if (debug) {
    // SAS9 adapters extract JSON from these markers, unlike SASjs/Studio frames.
    if (sas9)
      return {
        contents: `${result.log || ''}\n>>weboutBEGIN<<${result.webout || ''}>>weboutEND<<\n${result.print || ''}`,
        headers: { 'content-type': 'text/plain' },
        log: result.log
      }
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

const inWorkerScope = (client) => {
  if (!client.url) return false
  try {
    const url = new URL(client.url)
    const scope = new URL(self.registration.scope)
    return (
      url.origin === scope.origin && url.pathname.startsWith(scope.pathname)
    )
  } catch (e) {
    return false
  }
}

const broadcast = async (message) => {
  const clients = await self.clients.matchAll({ type: 'window' })
  clients.filter(inWorkerScope).forEach((client) => {
    // a tab that closed between matchAll() and the send raises
    // InvalidStateError, and one closed tab must not fail the broadcast the
    // others just received - nor the load that is waiting on this call
    try {
      client.postMessage(message)
    } catch (e) {
      /* that client is gone: the rest still get it */
    }
  })
}

/**
 * Resolvers waiting on the page's answer to a drive request, and that answer
 * once it lands.
 *
 * The page owns the drive (`persist.js`): IndexedDB is durable, this worker is
 * not - the browser terminates it between requests and starts a new one on the
 * next. That new worker has no drive, and `ensureReady` would seed over the
 * visitor's: every file they made reads `File doesn't exist.`, and creating one
 * the seed ships reads `File already exists.` So the worker asks a live page for
 * what it stored before it considers seeding.
 */
let driveWaiters = []

/** The page has answered, whatever it said; stop waiting. */
const driveArrived = (verdict) => {
  const waiting = driveWaiters
  driveWaiters = []
  waiting.forEach((resolve) => resolve(verdict))
}

/** How long one page gets to answer, and how long the whole ask may take. */
const ASK_TIMEOUT = 2000
const ASK_BUDGET = 5000

/**
 * A client's stable handle.
 *
 * `clients.matchAll()` builds fresh `Client` objects on every call, so the
 * object is not an identity and a set keyed on it would hand back the first tab
 * on every round - the second tab never asked, the budget spent, and the seed
 * this handshake exists to avoid. `client.id` is the one field that survives the
 * call; the object itself is a fallback for a host that reports none.
 */
const askedId = (client) => client.id || client

/**
 * Asks the page for its drive, and answers what came back.
 *
 * Concurrent requests share the one promise: a second ask would be a second
 * load of a drive the first is already installing.
 *
 * ONE CLIENT AT A TIME. A page answers by loading the drive into this worker,
 * so two tabs both answering is two installs and the last one wins; the second
 * tab is the fallback for the first not answering, not a second asker.
 *
 * A page that has not answered yet is not a reason to seed - a large drive, or
 * a busy tab, takes longer than one ask allows - so the ask is retried while
 * the budget lasts. Only when every page has had its turn does the seed path
 * take over, which is where this worker started; the stored drive is still in
 * IndexedDB and comes back on the next page load.
 *
 * 'unavailable' is the page saying it holds a drive it cannot read: the caller
 * must NOT seed over it, so the verdict travels back to `ensureReady`.
 */
let driveAsked = null
const askHostForDrive = () => {
  if (driveAsked) return driveAsked

  const asked = new Set()

  driveAsked = (async () => {
    const deadline = Date.now() + ASK_BUDGET

    while (Date.now() < deadline) {
      const clients = (
        await self.clients.matchAll({
          type: 'window'
        })
      ).filter(inWorkerScope)
      // no page to ask: nothing can have the drive
      if (!clients.length) return 'none'

      const client = clients.find((c) => !asked.has(askedId(c))) || clients[0]
      asked.add(askedId(client))

      // A tab that closed between `matchAll()` and this send raises
      // InvalidStateError. That is this client not answering, not a verdict: the
      // next one is tried and the budget still bounds the wait. Letting it throw
      // would reject the promise `driveAsked` holds, and every later ask would
      // return that rejection - so `ensureReady` would fall through to the seed
      // for the rest of this worker's life, which is the loss the ask exists to
      // prevent.
      try {
        client.postMessage({ type: 'sasjs-need-drive' })
      } catch (e) {
        continue
      }

      // Registered after a send that worked: a failed send leaves no waiter
      // behind for an answer that cannot come.
      const arrived = new Promise((resolve) => driveWaiters.push(resolve))

      const verdict = await Promise.race([
        arrived,
        new Promise((resolve) => setTimeout(() => resolve(null), ASK_TIMEOUT))
      ])

      if (verdict) return verdict
    }

    return 'none'
  })().then((verdict) => {
    // an unreadable drive is not a final answer: ask again on the next request
    // rather than failing every one for the life of this worker
    if (verdict === 'unavailable') driveAsked = null
    return verdict
  })

  return driveAsked
}

/**
 * Hands the page what changed: the drive files the runtime marked dirty, and the
 * identity store's own snapshot when a route changed it.
 *
 * The identity travels as the fixture `snapshot()` emits, which is exactly what
 * a boot seeds from - one shape for the file a person reads, the object the page
 * stores and the store it seeds. It is sent only when it differs from the last
 * report, so a drive-only request carries no fixture and an identity-only change
 * still reaches storage.
 *
 * A report the page never received is not a report: the batch is kept and sent
 * with the next one, and the fixture is reported again the next time.
 */
/** Files taken from the runtime whose report to the page failed. */
let unsentFiles = null

const persistChanges = async () => {
  // `takeDirty()` empties the runtime's map, and only the page writes the drive
  // on: a batch that never reached it is gone from the drive the next worker
  // instance loads, while this one has nothing left to hand over. So a failed
  // report is kept and goes out with the next one.
  const files = { ...(unsentFiles || {}), ...R.takeDirty() }
  const fixture = IDENTITY_STATE.store.snapshot()
  const asJson = IDENTITY_STATE.seeded ? JSON.stringify(fixture) : ''
  const previous = IDENTITY_STATE.persisted
  const identity = asJson && asJson !== previous ? fixture : null

  if (!Object.keys(files).length && !identity) {
    unsentFiles = null
    return
  }

  if (identity) IDENTITY_STATE.persisted = asJson

  try {
    await broadcast({ type: 'sasjs-persist', files, identity })
  } catch (e) {
    unsentFiles = files
    // the fixture is reported when it differs from the last one that ARRIVED
    if (identity) IDENTITY_STATE.persisted = previous
    throw e
  }

  unsentFiles = null
}

// ----------------------------------------------------------- the SAS transcript
/**
 * A recorded SAS session, for a project that ships one.
 *
 * A mock site is a JavaScript backend: there is no SAS binary here and never was, so a SAS
 * run cannot be executed and cannot fail for want of the binary either. It answers with a
 * session - the log, listing and webout a run of that program would have produced.
 *
 * By default that session is the mocked one below, which is the point of the mock: a visitor
 * who edits a `.sas` file or runs a buffer sees the Studio's log panel the way a real run
 * fills it, errors and warnings included, instead of being told about a binary a browser was
 * never going to have.
 *
 * A project may record a real session and commit it as `sas-transcript.json`, and a run of a
 * program it names is answered with that instead - the project's own output is better than
 * ours, and a demo of a specific report wants the real numbers.
 *
 * Shape: `{ "<program path>": {"log": "...", "print": "...", "webout": "..."} }`,
 * all three strings. The path is matched as written apart from the
 * `/sasjs/drive/files` prefix and the `.sas` suffix, so a recording keeps the
 * path a person sees; a bare file name is not enough, because that would answer
 * every file of that name in the drive. `{{program}}` in any of the three strings is
 * replaced with the program's logical path, so an answer can name what was run.
 */
const SAS_TRANSCRIPT = 'host/sas-transcript.json'

/**
 * The session a SAS run is answered with when the project has not recorded one.
 *
 * Written the way a SAS log is written - source lines with their numbers, notes, a warning and
 * an error, the process-time block - because the Studio parses this text: the log panel marks
 * errors and warnings from it, and a demo whose mock answered with an empty log would show a
 * panel that never lights up. The webout is what a service that sends data back would have
 * written, and the listing is what `proc print` puts on a page.
 */
const MOCKED_SESSION = {
  webout: '{"SYSSITE":"00000000","MOCKED":true}',
  log: [
    'NOTE: This is a mocked SAS session: a browser has no SAS binary.',
    '      The program below is {{program}}.',
    '',
    '1    data work.class;',
    '2      set sashelp.class;',
    '3      where age > 12',
    '4      by name;',
    '5    run;',
    '',
    'ERROR 22-322: Syntax error, expecting one of the following: ;, DATA, DATALINES,',
    '              DELETE, DESCRIBE, FILE, INPUT, LIST, MERGE, MODIFY, OUTPUT, PUT,',
    '              SET, UPDATE.',
    'ERROR 76-322: Syntax error, statement will be ignored.',
    '',
    'NOTE: The SAS System stopped processing this step because of errors.',
    'WARNING: The data set WORK.CLASS may be incomplete. When this step was stopped',
    '         there were 0 observations and 0 variables.',
    'NOTE: DATA statement used (Total process time):',
    '      real time           0.01 seconds',
    '      cpu time            0.01 seconds',
    '',
    '6    proc print data=sashelp.class (obs=3);',
    '7      var name age height weight;',
    '8    run;',
    '',
    'NOTE: There were 3 observations read from the data set SASHELP.CLASS.',
    'NOTE: The PROCEDURE PRINT printed page 1.',
    'NOTE: PROCEDURE PRINT used (Total process time):',
    '      real time           0.02 seconds',
    '      cpu time            0.02 seconds',
    '',
    'NOTE: The SAS System stopped processing this step because of errors.',
    'NOTE: SAS Institute Inc., SAS Campus Drive, Cary, NC USA 27513-2414'
  ].join('\n'),
  print: [
    'The SAS System',
    '',
    '  Obs    Name       Age    Height    Weight',
    '    1    Alfred      14     69.0     112.5',
    '    2    Alice       13     56.5      84.0',
    '    3    Barbara     13     65.3      98.0'
  ].join('\n')
}
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

/** A recording with its placeholders filled in, so a demo can name what was run. */
const withProgram = (recording, requested) => {
  // the replacement is a function, not a string: a program path may hold `$&` or `$1`, which a
  // string replacement expands, so a caller naming `services/$&x` would be answered with
  // `{{program}}` in place of their own path
  const fill = (value) =>
    String(value || '').replaceAll(
      '{{program}}',
      () => requested || 'the code in this buffer'
    )

  return {
    webout: fill(recording.webout),
    log: fill(recording.log),
    print: fill(recording.print)
  }
}

/**
 * The session this SAS run is answered with.
 *
 * The project's recording of that program if it shipped one, and the mocked session otherwise -
 * never a refusal, and never nothing. A SAS run is only reached here when the host cannot
 * execute it, which in a browser is always, so there is no case in which the honest answer is
 * "no".
 */
const transcriptFor = async (programPath) => {
  const requested = logicalPath(programPath)
  const recorded = await transcript()

  if (requested)
    for (const key of Object.keys(recorded))
      if (logicalPath(key) === requested)
        return withProgram(recorded[key], requested)

  return withProgram(MOCKED_SESSION, requested)
}

/**
 * Whether this request is a SAS run.
 *
 * A code run states its run time. A program run does not - the server resolves it against
 * `RUN_TIMES`, which is why `R.setRunTimes` puts that order into the runtime-core resolution -
 * and the file that comes back decides. It is the same resolution the runner makes, so the two cannot disagree about
 * which runs are SAS: a rule of my own here would sooner or later answer a run the runner
 * would have executed, or the reverse.
 */
const isSasRun = (code, runTime, program) => {
  // a code run always states its run time - the package refuses one without it - so this is
  // a plain comparison rather than a default
  if (code) return String(runTime || '').toLowerCase() === 'sas'

  // the request may name the program without its extension
  const resolved = R.resolveProgram(program)

  return Boolean(resolved && /\.sas$/i.test(resolved))
}

/**
 * The program a Studio code run came from, from the line the interface puts in
 * front of the buffer.
 *
 * Run in Studio posts the buffer to `/SASjsApi/code/execute` - not the file's
 * path - and the interface prepends `%let _program = <path>;` (its
 * `programPathInjection`) so a program can still see where it lives. That line is
 * the only thing in such a request that names the file, and it is what lets the
 * recording answer a Press Run on the program it recorded.
 *
 * The line is written whatever was sent - the whole buffer or a selection of it -
 * so the recording answers the program its path names, and a visitor who edits
 * the code before pressing Run still sees the session recorded for that file. A
 * browser cannot run SAS at all, so the alternative is a refusal for every SAS
 * run; the demo's program says what it is, and its comment says where the answer
 * comes from.
 */
const recordedProgramIn = (code, runTime) => {
  if (String(runTime || '').toLowerCase() !== 'sas') return undefined

  // anchored: the interface writes the line FIRST (`%let _program = ${path};\n`
  // + the buffer), so a `%let _program` further down is the program's own code -
  // a stored program that sets it deliberately, or a datalines row that looks
  // like it - and is not what this host answers. Without the anchor, a caller's
  // own SAS program could name the recorded file and be handed its session.
  const match = /^\s*%let\s+_program\s*=\s*([^;]+);/i.exec(String(code || ''))

  return match ? match[1].trim() : undefined
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
    const params = Object.assign(Object.create(null), request.vars || {})
    const sas9 = params[SAS9_FRAME]
    const tier = Boolean(params[TIER_FRAME])
    const execution = params[EXECUTION_FRAME]
    delete params[EXECUTION_FRAME]
    delete params[SAS9_FRAME]
    delete params[TIER_FRAME]
    // The package normalizes named debug values for the API, but the SAS9
    // controller passes its original variable directly to the execution host.
    // Its isDebugOn uses Number coercion instead of tier parseDebugValue; only
    // the output markers differ here so SAS9 adapters can extract the webout.
    if (sas9) {
      if (sas9.present) params._debug = sas9.value
      else delete params._debug
    }
    const debug = sas9
      ? Number.isFinite(Number(params._debug)) && Number(params._debug) >= 131
      : tier
        ? tierDebugOn(params._debug)
        : params._debug !== undefined

    const resolved =
      program.code === undefined ? R.resolveProgram(program.path) : undefined
    const isSas =
      String(request.runTime || '').toLowerCase() === 'sas' ||
      Boolean(resolved && /\.sas$/i.test(resolved))

    // A SAS run is answered with its session, here as on the run routes: those answer before the
    // runtime is reached, but a *trigger* goes through it, and a mock must not be the one place
    // that refuses a run for want of a binary it never had. Handing SAS source to the JavaScript
    // runner would be worse still - a SyntaxError quoting the source.
    let artifact
    if (isSas) {
      const recording = await transcriptFor(
        program.code !== undefined
          ? recordedProgramIn(program.code, request.runTime)
          : program.path
      )

      artifact = artifactOf(
        {
          webout: recording.webout || '',
          log: recording.log || '',
          print: recording.print || '',
          headers: SEEDED_HEADER_LINE
        },
        debug,
        Boolean(sas9)
      )
    } else {
      const payload = { params, tables: tablesOf(request.files), execution }
      if (program.code !== undefined) payload.code = program.code
      else payload.program = program.path

      const result = await R.run(payload)
      if (result.error) throw runFailure(result.error)

      artifact = artifactOf(result, debug, Boolean(sas9))
    }
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
    get csv() {
      const csv = file.csv
      return csv !== undefined ? csv : toText(file.contents)
    },
    bytes: file.bytes !== undefined ? file.bytes : file.contents
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

// ------------------------------------------------------------- what it can run
/**
 * The run times this host answers, in order of priority.
 *
 * `js` is executed here, in the page's own JavaScript engine. `sas` is answered from a session -
 * the project's recording of that program (`host/sas-transcript.json`) when it ships one, and the
 * mocked session otherwise. That holds on every route that runs one: a run, a code run, and a
 * trigger, which reaches the runtime rather than the run route and is answered there.
 *
 * The order is the priority SASjs Server gives `RUN_TIMES` (`docs/pages/settings.md`): `js` leads
 * here, because a browser executes JavaScript and holds a recording where a server has a binary.
 * Everything else is derived from this list - the order an extension-less program is resolved in
 * (`R.setRunTimes` below), and what `/SASjsApi/info` and the runtime service report, so the run
 * times the host publishes and the ones its service accepts cannot drift apart. `sas` is stated
 * because that is what offers Run on a `.sas` file at all.
 */
const RUN_TIMES = ['js', 'sas']

// the order decides which program an extension-less reference runs, the way the server's
// RUN_TIMES does - `services/x` is `x.js` here, because `js` comes first
R.setRunTimes(RUN_TIMES)

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
        runTimes: RUN_TIMES,
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
    IDENTITY_STATE.store.snapshot().users.map((user) => ({
      username: user.username,
      displayName: user.displayName
    })),
  groups: async () =>
    IDENTITY_STATE.store.snapshot().groups.map((group) => ({
      name: group.name,
      members: group.users || []
    }))
}

/**
 * The app stream, over the drive this site carries.
 *
 * The package owns the index and every rule about it: what a publish must say,
 * when an id is minted and when a redeploy keeps it, what the listing answers,
 * how an app's files are found, what a removal removes. This host owns only the
 * bytes - the drive store, which is persisted with the rest of the drive, so an
 * app published in a mock survives a reload exactly as it would on a server.
 *
 * Nothing is published until a deploy publishes something, which is what makes
 * the mock honest: a `sasjs deploy` against it, or a bundle posted to
 * `/SASjsApi/drive/deploy`, is listed and served here the way it is on a server.
 * The folder the site itself was built for is deliberately not seeded as an app:
 * its files are this site's static build, not a deployment in the drive, so a
 * tile for it would open a 404.
 */
const APP_STREAM = API.createAppStreamService(
  API.createDriveAppStreamStore(API.createDriveService(DRIVE_STORE))
)

/**
 * The app stream's own web surface: the landing page, the listing, an app's
 * files and the removal of one.
 *
 * Mounted at the short spelling, which is what the interface links to; the
 * canonical one is translated to it below, so both answer.
 *
 * `basePath` is the site's own folder plus that spelling, and the paths handed
 * to the package include the folder too - the package builds an app's URL, its
 * tiles and its logo links from `basePath`, so a surface mounted at `/app` on a
 * site served from `/demo` would answer a listing whose every link pointed at
 * the site root. Both sides take the same base and the answers land inside the
 * folder.
 */
/**
 * The app stream's prefix: what a rule names to cover every app at once.
 */
const APP_STREAM_PREFIX = '/AppStream'

/**
 * The tiers a build's links address, answered here rather than by the static
 * host. The estate's prefixes are not in this literal: they come from
 * `VIYA_PREFIXES`, and `isAnswered` joins the two, so a family the emulator
 * gains is routed rather than served `index.html`.
 */
const TIER_PATHS =
  /^\/(SASjsApi|SASLogon|AppStream|api|app|SASJobExecution|StoredProgram|SASStoredProcess)(\/|$)/i

/**
 * The paths a Viya-targeted application asks for, which no SASjs route table has:
 * compute, folders, files, identities, types, and the batch families
 * (jobDefinitions, jobExecution, launcher).
 *
 * Read from the package's route table rather than written out, so a family the
 * emulator gains is answered here without a second list to remember - and read
 * *through* `TIER_PATHS`, so a family whose first segment is a tier this host
 * already serves (`/SASLogon`, and any the package adds later) is left to the
 * host rather than taken from it. `/SASLogon` is the overlap that exists today;
 * its estate path, the token endpoint, is named in `ESTATE_PATHS`.
 *
 * The worker answers these from `@sasjs/api`'s emulator over the drive and
 * identity it already holds - the same answers, and the same `x-sasjs-emulated`
 * header, a server running `EMULATE_VIYA` gives.
 */
const VIYA_PREFIXES = [
  ...new Set(
    API.VIYA_TABLE.map(
      (route) => `/${route.path.split('/').filter(Boolean)[0]}`
    )
  )
]
  .map((prefix) => prefix.toLowerCase())
  .filter((prefix) => !TIER_PATHS.test(prefix))

/**
 * The estate paths that are not a whole family.
 *
 * `/SASLogon` cannot be a prefix: it carries this host's own sign-in routes
 * (`POST /SASLogon/login` among them) as well as the estate's token endpoint, and
 * taking the family would answer this host's routes from the emulator. The token
 * endpoint is named instead, so it is answered here - with the emulator's own
 * refusal, `implemented: false` in its overlay because the token port belongs to
 * the host that mounts the emulator - rather than falling through to the SASjs
 * route table or to the static host.
 */
/**
 * The two endpoints a Viya client speaks to sign in: the authorize step it
 * redirects to, and the token step it exchanges a code at.
 *
 * Both are the host's, not the emulator's - the emulator holds no account to
 * check a credential against, exactly as on a server, where `routes/viya` answers
 * the token port from the server's own accounts. `IDENTITY` verifies the client
 * and mints the pair, and every answer here carries the same `x-sasjs-emulated`
 * stamp as the estate's, because this host is standing in for Viya whichever
 * endpoint is asked.
 *
 * They are named once: `ESTATE_PATHS` is what makes the worker answer them, and
 * the handlers below are what answers - a literal repeated in both could leave a
 * handler that never runs. The authorize step is not a row in the package's
 * table: it is this host's own half of the token port, the page a client is sent
 * to before it holds a code.
 */
const OAUTH_AUTHORIZE = '/saslogon/oauth/authorize'
const OAUTH_TOKEN = '/saslogon/oauth/token'

const ESTATE_PATHS = [OAUTH_TOKEN, OAUTH_AUTHORIZE]

// ------------------------------------------------------------ the sign-in page
/**
 * The page a browser is sent to before it holds a session.
 *
 * A Viya deployment sends a client that arrives without a session here; a mock
 * site has no wall, so this is the page an operator or a demo asks for rather
 * than one they are forced through. The form is the estate's shape - a username
 * and a password posted to this path.
 *
 * The session is the page's, not the worker's: a service worker is not handed
 * cookies (`request.headers` has none) and a `Set-Cookie` it writes is ignored,
 * so the answer is a redirect carrying the account, which `persist.js` stores as
 * the subject it already keeps for `SASjsMock.as()`.
 */
const LOGIN_PATH = '/saslogon/login'

/** Text that came from a request, made safe for the page it is written into. */
const escapeHtml = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      })[character]
  )

/** Where a signed-in browser is sent: this site, never anywhere else. */
const signInTarget = (service, url) => {
  const root = `${new URL(`${BASE}/`, url.origin).pathname}`

  if (!service) return root

  try {
    const target = new URL(service, url.origin)

    return target.origin === url.origin ? target.pathname + target.search : root
  } catch (error) {
    return root
  }
}

/** The sign-in page, with what the last attempt said. */
const loginPage = ({ message = '', service = '', status = 200 }) => {
  const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Sign in</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 0; background: #f6f7f9; color: #1b1f24; }
  main { max-width: 22rem; margin: 10vh auto; background: #fff; padding: 2rem; border-radius: .5rem;
         box-shadow: 0 1px 3px rgba(0,0,0,.12); }
  h1 { font-size: 1.25rem; margin: 0 0 .5rem; }
  .note { color: #57606a; font-size: .8rem; margin: 0 0 1.25rem; }
  .error { background: #ffebe9; border: 1px solid #ff8182; color: #82071e; padding: .5rem .75rem;
           border-radius: .25rem; font-size: .85rem; margin: 0 0 1rem; }
  label { display: block; font-size: .85rem; margin-bottom: .75rem; }
  input { width: 100%; box-sizing: border-box; margin-top: .25rem; padding: .5rem;
          border: 1px solid #d0d7de; border-radius: .25rem; font-size: 1rem; }
  button { width: 100%; padding: .6rem; font-size: 1rem; border: 0; border-radius: .25rem;
           background: #1f6feb; color: #fff; cursor: pointer; }
</style>
</head>
<body>
<main>
  <h1>Sign in</h1>
  <p class="note">This is the emulated estate's sign-in page on a mock site. No SAS server is involved,
  and the accounts are the ones the build's identity fixture declares. The account you choose is
  carried in the address you land on, so a link to a signed-in view can be shared - an emulated
  estate protects nothing, and the same choice is one call away in the console.</p>
  ${message ? `<p class="error" role="alert">${escapeHtml(message)}</p>` : ''}
  <form method="post" action="${BASE}${LOGIN_PATH}" autocomplete="on">
    <label>Username <input name="username" autocomplete="username" autofocus></label>
    <label>Password <input name="password" type="password" autocomplete="current-password"></label>
    <input type="hidden" name="service" value="${escapeHtml(service)}">
    <button type="submit">Sign in</button>
  </form>
</main>
</body>
</html>`

  return new Response(page, {
    status,
    headers: Object.assign(
      {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store'
      },
      API.emulatedHeaders()
    )
  })
}

/** The sign-out a browser follows, which ends the cookie's session. */
const LOGOUT_PATH = '/saslogon/logout'

/**
 * Ends the caller the worker holds, and asks the browser to end the page's own.
 *
 * The package answers `OK!` and leaves the session alone, because on a server the
 * session is the server's. Here the session is the page's, so the answer carries
 * a `Refresh` into the site with `sasjs-signout=1`: `persist.js` drops the stored
 * subject, and the worker's caller goes back to the one the boot names.
 */
const signOut = async () => {
  // back to the account the boot named, which for a signed-out site is the
  // fixture's administrator - the same answer a first visit gets
  CALLER_USERNAME = undefined
  resolveCaller()

  // the body stays the package's: the conformance corpus pins this route to
  // `OK!`, and a sign-out that changed it would be a different contract. The
  // browser is sent into the site by a header instead, where the page drops the
  // session it owns.
  //
  // Only that navigation ends the session. The row holding the account belongs to
  // the page, and a worker cannot write it, so a caller that reads this answer
  // without following a navigation - a fetch, an XHR, a script - ends the worker's
  // caller and nothing else: the next page load boots the stored subject and the
  // visitor is signed in again. A browser that follows the redirect lands on
  // `#sasjs-signout=1`, which the page reads and clears.
  return new Response(await IDENTITY.logoutSession(), {
    status: 200,
    headers: Object.assign(
      {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        refresh: `0; url=${BASE}/#sasjs-signout=1`
      },
      API.emulatedHeaders()
    )
  })
}

/**
 * The sign-in page's two answers.
 *
 * A GET is the page. A form post is a browser, not an API client, so it is
 * answered as a browser expects: a redirect into the site carrying the account,
 * or the page again with what went wrong. A JSON post is the package's own
 * route, and is left to answer it.
 */
const signIn = async (request, url) => {
  const service = url.searchParams.get('service') || ''

  if (request.method === 'GET' || request.method === 'HEAD')
    return loginPage({ service })

  const type = request.headers.get('content-type') || ''

  if (!type.includes('application/x-www-form-urlencoded')) return undefined

  const form = new URLSearchParams(await request.text())

  try {
    const { user } = await IDENTITY.login({
      username: form.get('username') || '',
      password: form.get('password') || ''
    })

    CALLER_USERNAME = user.username
    resolveCaller()

    // the account travels in the address the browser lands on, and `persist.js`
    // stores it as the subject `SASjsMock.as()` already keeps: the page owns the
    // session because a service worker cannot read or set a cookie
    const target = new URL(
      signInTarget(form.get('service') || service, url),
      url.origin
    )
    // the fragment, not the query: it is not sent in a Referer, so the account
    // does not travel to whatever the page links to next
    target.hash = `sasjs-caller=${encodeURIComponent(user.username)}`

    return new Response(null, {
      status: 302,
      headers: Object.assign(
        {
          location: `${target.pathname}${target.search}${target.hash}`,
          'cache-control': 'no-store'
        },
        API.emulatedHeaders()
      )
    })
  } catch (error) {
    // the estate answers a refused sign-in with the form again and what went
    // wrong, rather than a status a browser would render as a blank page
    if (error instanceof API.ApiError)
      return loginPage({
        message: error.message,
        // the service a form post carries is in the body, not the address: losing
        // it would drop the caller on the site root after one wrong password
        service: form.get('service') || service
      })

    throw error
  }
}

const isViyaPath = (path) => {
  // the prefixes are lowercased when the list is built: Viya's own families are
  // mixed case (`/jobExecution`), and a path compared as written would never
  // match them
  const lower = path.toLowerCase()

  return (
    ESTATE_PATHS.includes(lower) ||
    VIYA_PREFIXES.some(
      (prefix) => lower === prefix || lower.startsWith(`${prefix}/`)
    )
  )
}

/**
 * Whether the worker is handed this request at all: a build's tiers, or the
 * estate's prefixes - which come from `VIYA_PREFIXES` rather than a second list
 * written into the listener, so a sixth prefix is answered instead of being left
 * to the static host, where a client would parse `index.html` as JSON.
 */
const isAnswered = (path) => TIER_PATHS.test(path) || isViyaPath(path)

/** One caller's rules, in the shape the route decision takes them. */
const routeRulesOf = (permissions) => ({
  user: (permissions || [])
    .filter((rule) => rule.user !== undefined)
    .map((rule) => ({ path: rule.path, setting: rule.setting })),
  group: (permissions || [])
    .filter((rule) => rule.group !== undefined)
    .map((rule) => ({ path: rule.path, setting: rule.setting }))
})

/**
 * The caller's own rule about which apps it may see.
 *
 * The surface takes this from the host, because only the host knows the rules a
 * caller holds. sasjs/server answers it with `appIsGranted`: the path a rule
 * names decides - the app's id, or the label an older rule uses - and the stream
 * prefix decides when no rule names either. A browser host reads the same rules
 * from the fixture, so a `Deny` on `/AppStream/orders` hides that app here as it
 * does on a server, and a fixture with no app rules shows every published app.
 */
const appFilterFor = async (subject) => {
  const rules = routeRulesOf(await RECORDS.listPermissions(subject))

  return (entry) =>
    API.isRouteGranted(
      rules,
      [
        `${APP_STREAM_PREFIX}/${entry.id}`,
        entry.name ? `${APP_STREAM_PREFIX}/${entry.name}` : ''
      ].find((path) =>
        [...rules.user, ...rules.group].some((rule) => rule.path === path)
      ) || APP_STREAM_PREFIX,
      APP_STREAM_PREFIX
    )
}

/**
 * The filter to hand the surface, cached per caller.
 *
 * The surface asks it for every request under `/app`, an app's own assets
 * included, and each answer would otherwise read the permission records and the
 * groups. The key carries the chosen account and the fixture the page last
 * persisted, so signing in as someone else or writing a rule re-reads once and
 * every request after that does not.
 */
let appFilterCache
const appFilter = async (subject) => {
  const key = `${String(CALLER_USERNAME)}|${String(IDENTITY_STATE.persisted)}`
  if (appFilterCache && appFilterCache.key === key) return appFilterCache.filter

  // the account the subject names, read from the fixture this host already
  // holds: an administrator holds every app, so the rules are not asked at all
  const caller = subject
    ? IDENTITY_STATE.store
        .snapshot()
        .users.find((user) => user.uid === subject.userId)
    : undefined

  const filter = !caller
    ? () => false
    : caller.isAdmin
      ? () => true
      : await appFilterFor(subject)

  appFilterCache = { key, filter }
  return filter
}

let appStreamWeb
const appStreamSurface = () => {
  if (!appStreamWeb)
    appStreamWeb = API.createAppStreamWebService(
      APP_STREAM,
      API.createDriveService(DRIVE_STORE),
      { basePath: `${BASE}${SHORT_APP_STREAM_PATH}` }
    )
  return appStreamWeb
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

/**
 * The lint rules a SAS file is linted against: the nearest `.sasjslint` at or
 * above its folder on the drive.
 *
 * This is the server's rule, applied here so the demo behaves like the
 * installation it demonstrates: a folder in the tree carries rules for
 * everything beneath it, and changing a rule is a plain edit of that file. It
 * is why the build seeds a `.sasjslint` at the drive root - a file that is
 * displayed but never read would be worse than absent.
 *
 * Paths go through the package's own normaliser, so a backslashed or escaping
 * path resolves the way the drive routes resolve it rather than by a second set
 * of string rules that could disagree with them.
 *
 * A file that is missing, is not JSON, or parses to something that is not an
 * object is skipped and the walk continues upwards - a broken rules file must
 * never break linting or formatting. A walk that reaches the root with nothing
 * to show returns undefined, which lints against the linter's own defaults: the
 * answer for a drive with no rules file at all.
 */
const LINT_CONFIG_FILE = '.sasjslint'

/**
 * The linter, bundled at build time from the installed @sasjs/api/code and
 * @sasjs/lint (see mockSite.ts).
 *
 * Imported with the rest of the host, not on the first code route: a service
 * worker may only `importScripts` while its own script is being evaluated, so a
 * call made from a request handler fails with "The script at ... failed to load"
 * - the linter would be missing exactly where it is needed. What stays lazy is the
 * service built from it: `createCodeService` is cheap, and only a code route
 * calls it.
 */
let codeService
let linter

const code = () => {
  if (codeService) return codeService
  linter = self.SASjsCode
  codeService = linter.createCodeService({
    lintConfig,
    reprint: (text, options) =>
      linter.formatText(text, {
        ...options,
        dataRoot: `${self.location.origin}${BASE}/host/${linter.dataPath}`
      })
  })
  return codeService
}

/**
 * The package's code service, resolved on first use.
 *
 * A proxy rather than an object listing `lint` and `format`: the package decides
 * which methods a service has, and a facade would answer `undefined` for one a
 * later version adds. Dispatch reads `services.code` once per request and only
 * touches a method on a code route, so nothing below the first method access
 * loads the linter.
 */
const lazyCode = () =>
  new Proxy(
    {},
    {
      get: (target, property) => {
        // probing for a promise is not a method lookup: answering it must not
        // pull 40KB
        if (typeof property === 'symbol' || property === 'then')
          return undefined
        const service = code()
        const value = service[property]
        return typeof value === 'function' ? value.bind(service) : value
      }
    }
  )

const lintConfig = async (filePath) => {
  // A path that escapes the drive has no folder to walk from, and a buffer that
  // names no file has none either: both take the drive root's rules, which is
  // what a server answers for each - a refused path there falls back to the
  // root file rather than to the linter's defaults.
  let folder = API.dirname(API.normaliseDrivePath(filePath) ?? '/')
  for (;;) {
    const configPath =
      folder === '/' ? `/${LINT_CONFIG_FILE}` : `${folder}/${LINT_CONFIG_FILE}`
    const contents = await DRIVE_STORE.read(configPath).catch((e) => {
      // a piece that is still on the site is not a folder with no rules file:
      // swallowing it here would lint against the defaults and never fetch it
      if (e && e.code === R.PENDING_CODE) throw e
      return null
    })
    const parsed = parseLintConfig(contents)
    if (parsed) return new linter.LintConfig(parsed)
    if (folder === '/') return undefined
    folder = API.dirname(folder)
  }
}

/** A `.sasjslint` as the object a configuration is built from, or null. */
const parseLintConfig = (contents) => {
  if (contents === null || contents === undefined) return null
  const text =
    typeof contents === 'string' ? contents : new TextDecoder().decode(contents)
  try {
    const parsed = JSON.parse(text)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch (e) {
    return null
  }
}

const SERVICES = {
  drive: API.createDriveService(DRIVE_STORE),
  // The read a streamed deployment links to, over the same store as the drive:
  // a file the deploy wrote is the file its page fetches, typed by the package
  // exactly as the server types it
  deploymentFile: API.createDeploymentFileService(DRIVE_STORE),
  // The package's browser fixture states one run time; this host serves two, and
  // `info` is what the Studio reads to decide whether a file may be run at all,
  // so the answer is the host's own list rather than the fixture's.
  info: API.createInfoService(
    Object.assign({}, API.BROWSER_INFO, { runTimes: RUN_TIMES })
  ),
  identity: IDENTITY,
  records: RECORDS,
  runtime: API.createRuntimeService(IDENTITY_STORE, RUNTIME, {
    // `js` is executed here; `sas` is offered because the recording answers the
    // program it names, and the Studio offers Run on a `.sas` file only for a run
    // time the host states. A `.sas` program with no recording is refused in the
    // runner, deliberately - it must not be handed to the JavaScript runtime as
    // source, which is what the guard in BrowserRuntime.run prevents.
    runTimes: RUN_TIMES
  }),
  session: API.createSessionService(IDENTITY_STORE, RUNTIME),
  authConfig: API.createAuthConfigService({}),
  admin: API.createAdminService(adminReports),
  directory: API.createDirectoryService(IDENTITY_STORE, directorySource),
  appStream: APP_STREAM,
  home: homeService,
  // the package's own code service over the bundled linter, with the drive's
  // own rules: a buffer is linted and formatted against the nearest
  // `.sasjslint` at or above its folder, so editing that file changes the
  // editor here exactly as it does on a server
  code: lazyCode()
}

/**
 * The services the emulated estate answers through.
 *
 * The drive is this host's own, so a file uploaded over the Viya paths is the
 * file the SASjs API routes read back, and the address the site is served from is
 * the estate's identity - the only input to its seed, exactly as it is on a
 * server. The address is its scheme, host and port, so what separates two builds on
 * one origin is the drive they each persist, not the seed.
 */
const VIYA_SERVICES = {
  drive: SERVICES.drive,
  // the address, as the package reads it: scheme, host and port. A path is not
  // part of an address to `normaliseServerUrl` (sasjs/api `viya/seed.ts`), so the
  // path is not passed - and it would change nothing if it were. Two builds on
  // one origin are still two sites, because the drive they see is named for the
  // mount (`persist.js` opens `sasjs-mock-host:<mount>`), which is what has to be
  // separate for them not to share one filesystem.
  viya: { serverUrl: self.location.origin }
}

/**
 * A matcher for one of the package's operations, built from the route template the
 * table carries, so a path this host treats specially is the table's own path
 * rather than a second copy of it. `{}` is the table's parameter marker.
 *
 * A missing id answers false instead of throwing: a package rename must not take
 * the whole host down, and a spec pins both ids so the rename fails there, loudly,
 * rather than here silently.
 */
const operationMatcher = (id) => {
  const route = API.VIYA_TABLE.find((entry) => entry.id === id)

  if (!route) return () => false

  const pattern = new RegExp(`^${route.path.replace(/\{\}/g, '[^/]+')}$`)

  return (path) => pattern.test(path)
}

/** A file's content, which arrives as the body rather than as JSON. */
const isContentPath = operationMatcher('PUT /files/files/{}/content')

/** A file's upload, which arrives as a multipart part rather than as JSON. */
const isUploadPath = operationMatcher('POST /files/files')

/**
 * One request to the emulated estate, answered by `@sasjs/api`.
 *
 * The transport is the whole of this function: a `Request` is not the package's
 * `ApiRequest`, so the query, the body (or the bytes, or the multipart part) and
 * the caller are read here, and the answer's status, headers, body and byte
 * content are written back unchanged - including the `x-sasjs-emulated` stamp,
 * which is the package's to set, not this host's.
 *
 * The caller is the account the page chose, which is the same answer the SASjs
 * routes get - so the bodies this host returns name that account, not a generic
 * emulated user.
 *
 * A service's own nested call has no page and no account of its own: `inherited`
 * carries the caller that started the run, so the emulation answers for the
 * same account throughout the recursion.
 */
// The project explicitly registers JavaScript twins, not SAS or arbitrary code.
// This is a small adapter-facing JES emulation, not a general Viya job service.
// The package still owns unregistered routes and the legacy web-tier stub.
const VIYA_MOCK_FOLDERS = new Map()
let VIYA_MOCK_JOBS
const viyaMockJobs = async () => {
  if (!VIYA_MOCK_JOBS) {
    VIYA_MOCK_JOBS = fetch(`${BASE}/host/mock-config.json`)
      .then((response) => response.json())
      .then((config) =>
        Array.isArray(config.viyaMockJobs) ? config.viyaMockJobs : []
      )
  }
  return VIYA_MOCK_JOBS
}

const VIYA_MOCK_RESULTS = new Map()
let VIYA_MOCK_SEQUENCE = 0
const viyaMockResponse = (body, status = 200, type = 'application/json') =>
  new Response(type === 'application/json' ? JSON.stringify(body) : body, {
    status,
    headers: { 'content-type': type, ...API.emulatedHeaders() }
  })

const registeredJs = (program) => {
  const resolved = R.resolveProgram(program + '.js')
  return resolved === `/sasjs/drive/files${program}.js`
}

const viyaMockJobRequest = async (request, path, subject) => {
  const jobs = await viyaMockJobs()
  if (!jobs.length) return null
  const definition = /^\/jobDefinitions\/definitions\/([^/]+)$/.exec(path)
  if (definition && request.method === 'GET') {
    const program = decodeURIComponent(definition[1])
    if (!jobs.includes(program) || !registeredJs(program)) return null
    return viyaMockResponse({
      id: definition[1],
      name: program.slice(program.lastIndexOf('/') + 1),
      program
    })
  }
  if (path === '/jobExecution/jobs' && request.method === 'POST') {
    const body = await request.clone().json()
    const program = body && body.arguments && body.arguments._program
    if (
      !jobs.includes(program) ||
      !body.jobDefinition ||
      body.jobDefinition.program !== program
    )
      return null
    const grants = await RECORDS.myAuthorizedRoutes(subject)
    if (!grants.paths.includes('/SASjsApi/stp/execute'))
      throw new API.ApiError(401, 'Unauthorized')
    const files = []
    const count = Number(body.arguments._webin_file_count || 0)
    if (!Number.isInteger(count) || count < 0 || count > 100)
      throw badRequest('Invalid file count')
    for (let i = 1; i <= count; i++) {
      const uri = body.arguments[`_webin_fileuri${i}`]
      if (!/^\/files\/files\/[^/]+$/.test(uri || ''))
        throw badRequest('Invalid file URI')
      const result = await API.dispatchViya(
        VIYA_SERVICES,
        'GET',
        uri + '/content',
        { subject }
      )
      if (result.status !== 200)
        throw new API.ApiError(result.status, 'Uploaded file not found')
      files.push({
        name: body.arguments[`_webin_name${i}`],
        contents: result.contents
      })
    }
    await R.ensureAll()
    if (!registeredJs(program))
      throw new API.ApiError(404, 'Registered JavaScript mock not found')
    const output = await R.run({
      program: program + '.js',
      params: body.arguments,
      tables: tablesOf(files)
    })
    if (output.error) throw runFailure(output.error)
    await persistChanges()
    const id = String(++VIYA_MOCK_SEQUENCE)
    const resultPath = `/jobExecution/jobs/${id}/results/webout`
    const links = [{ rel: 'state', href: `/jobExecution/jobs/${id}/state` }]
    const job = { id, links, results: { '_webout.json': resultPath } }
    VIYA_MOCK_RESULTS.set(id, { job, output, owner: subject && subject.userId })
    return viyaMockResponse(job, 201)
  }
  const result =
    /^\/jobExecution\/jobs\/(\d+)(?:\/(state|results\/webout\/content))?$/.exec(
      path
    )
  if (result && request.method === 'GET') {
    const saved = VIYA_MOCK_RESULTS.get(result[1])
    if (!saved || saved.owner !== (subject && subject.userId)) return null
    if (result[2] === 'state')
      return viyaMockResponse('completed', 200, 'text/plain')
    if (result[2])
      return viyaMockResponse(
        saved.output.webout || '',
        200,
        'application/json; charset=utf-8'
      )
    return viyaMockResponse(saved.job)
  }
  return null
}

const viyaRequest = async (request, url, path, inherited) => {
  const query = Object.create(null)
  for (const [key, value] of url.searchParams.entries()) query[key] = value

  const apiRequest = {
    query,
    token: bearerOf(request, query),
    subject: await subjectOf(request, query, undefined, inherited)
  }

  if (/^\/(jobDefinitions|jobExecution)\//.test(path)) {
    try {
      const mock = await viyaMockJobRequest(request, path, apiRequest.subject)
      if (mock) return mock
    } catch (error) {
      if (error instanceof API.ApiError)
        return viyaMockResponse({ message: error.message }, error.status)
      throw error
    }
  }

  if (request.method === 'POST' && isUploadPath(path)) {
    // the multipart part, read by the host's own reader: the emulator takes the
    // name the client sent and the bytes, not a file this worker staged
    const payload = await readPayload(request.clone())
    apiRequest.body = payload.body
    let file = singleFile(payload)
    if (
      !file &&
      (await viyaMockJobs()).length &&
      (request.headers.get('content-type') || '').includes('application/json')
    ) {
      const raw = await request.text()
      if (raw && !raw.trimStart().startsWith('{')) {
        if (bytesOf(raw) > R.MAX_UPLOAD_BYTES)
          throw payloadTooLarge(R.MAX_UPLOAD_BYTES)
        file = {
          name: `sasjs-upload-${crypto.randomUUID()}.csv`,
          contents: raw
        }
      }
    }
    if (file) apiRequest.file = file
  } else if (request.method !== 'GET' && request.method !== 'HEAD') {
    if (isContentPath(path))
      apiRequest.contents = new Uint8Array(await request.arrayBuffer())
    else apiRequest.body = await readJson(request)
  }

  const answer = await API.dispatchViya(
    VIYA_SERVICES,
    request.method,
    path,
    apiRequest
  )

  if (
    request.method === 'GET' &&
    path === '/folders/folders/@item' &&
    answer.status === 200 &&
    query.path
  )
    VIYA_MOCK_FOLDERS.set(answer.body.id, query.path.replace(/\/+$/, ''))
  const members = /^\/folders\/folders\/([^/]+)\/members$/.exec(path)
  if (request.method === 'GET' && members && answer.status === 200) {
    const folder = VIYA_MOCK_FOLDERS.get(members[1])
    const jobs = await viyaMockJobs()
    if (folder && jobs.length) {
      for (const program of jobs) {
        if (program.slice(0, program.lastIndexOf('/')) !== folder) continue
        const name = program.slice(program.lastIndexOf('/') + 1)
        if (!registeredJs(program)) continue
        const id = encodeURIComponent(program)
        answer.body.items.push({
          name,
          links: [
            { rel: 'getResource', href: `/jobDefinitions/definitions/${id}` }
          ]
        })
      }
      answer.body.count = answer.body.items.length
    }
  }

  // a folder or file the estate created is a change to this host's drive - but
  // only an answer that succeeded can have changed one: the emulator's refusals
  // (the token endpoint, launcher, jobExecution) cost no write
  if (
    request.method !== 'GET' &&
    request.method !== 'HEAD' &&
    answer.status < 300
  )
    await persistChanges()

  const headers = Object.assign({}, answer.headers || {})

  if (answer.contents !== undefined)
    return new Response(answer.contents, { status: answer.status, headers })

  // the emulator sets its own type; a duplicate key under another casing would
  // leave the effective one to merge order, so the default is only written when
  // no casing of the header is present at all
  if (!Object.keys(headers).some((key) => key.toLowerCase() === 'content-type'))
    headers['content-type'] = 'application/json'

  return new Response(
    answer.body === undefined || answer.body === null
      ? null
      : JSON.stringify(answer.body),
    { status: answer.status, headers }
  )
}

/** The routes this host performs itself, because the answer is not JSON. */
const RUN_ROUTES = new Set([
  'GET /SASjsApi/stp/execute',
  'POST /SASjsApi/stp/execute',
  'POST /SASjsApi/stp/trigger',
  'POST /SASjsApi/code/execute',
  'POST /SASjsApi/code/trigger'
])

/**
 * The run routes a permission rule addresses.
 *
 * A run is answered by this host rather than by `API.dispatch`, so the question
 * is asked here: the answer is the one `/info/myAuthorizedRoutes` gives the
 * interface, which is why a denied rule refuses the call and not only the menu
 * entry beside it.
 *
 * Neither the drive routes nor the triggers are gated here, and that is
 * deliberate: the drive routes stay ungated because the package does not gate
 * them yet either (no rule is applied to a drive call until sasjs/api#97 lands,
 * and that gates the run routes only), and the triggers are outside the
 * inventory the rules address, as they are on a server.
 *
 * This set is a copy of the package's own list in `src/host/dispatch.ts`, and it
 * fails open: a run route the package adds later is silently ungated here. It is
 * retired by the `@sasjs/api` release that carries `mayUseRoute` - when the pin
 * reaches that version, delete this set and ask the method instead, which is one
 * decision rather than a read of the whole reported list, and stops the per-run
 * re-read of the rules and the groups. The page bridge's executionGrant is
 * checked against each upload-capable route in this set by intercept.spec.ts.
 */
const GRANTED_RUN_ROUTES = new Set([
  'GET /SASjsApi/stp/execute',
  'POST /SASjsApi/stp/execute',
  'POST /SASjsApi/code/execute'
])

/**
 * The routes that resolve their own caller from the token, rather than being
 * given one the transport resolved.
 *
 * `/auth/refresh` reads the bearer as a REFRESH token and `/auth/token` reads a
 * code, so reading them as access tokens first would refuse the very request the
 * route exists to answer - sasjs/server mounts these ahead of its
 * `authenticateAccessToken` middleware for the same reason.
 */
const SELF_AUTH_ROUTES = new Set([
  'POST /SASjsApi/auth/token',
  'POST /SASjsApi/auth/refresh',
  'POST /SASjsApi/auth/logout',
  'POST /SASLogon/login',
  'GET /SASLogon/logout'
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
const readJsonBody = async (request, allowLargeFile = false) => {
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
    if (!allowLargeFile) {
      for (const table of body.tables) {
        const contents = String(table.csv === undefined ? '' : table.csv)
        let size
        if (table.binary) {
          const encoded = contents.replace(/\s+/g, '')
          const padding = (encoded.match(/=+$/) || [''])[0].length
          size = Math.floor((encoded.length * 3) / 4) - padding
        } else {
          // UTF-8 is at least one byte per UTF-16 code unit. Avoid allocating
          // an encoded copy when the string alone already exceeds the cap.
          size =
            contents.length > R.MAX_UPLOAD_BYTES
              ? contents.length
              : bytesOf(contents)
        }
        if (size > R.MAX_UPLOAD_BYTES) throw payloadTooLarge(R.MAX_UPLOAD_BYTES)
      }
    }
    return {
      body: body.params,
      files: body.tables.map((table, index) => ({
        name: table.name || `table${index + 1}`,
        filename:
          table.filename || `${table.name || 'table' + (index + 1)}.csv`,
        // The bridge carries every file as base64 so BOM and arbitrary bytes survive.
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
  if (!type.includes('multipart/form-data'))
    return await readJsonBody(request, allowLargeFile)
  const form = await request.formData().catch(() => null)
  if (!form) return parsed
  // Only declared parameter tables use repeated fields as ordered CSV chunks.
  const entries = Array.from(form.entries())
  const declarations = entries.filter(
    ([name]) => name.toLowerCase() === 'sasjs_tables'
  )
  const tableNames = String(declarations.at(-1)?.[1] || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  const tableFields = new Set(
    tableNames.map((_name, index) => `sasjs${index + 1}data`)
  )
  for (const [name, value] of entries) {
    if (typeof value === 'string') {
      // The web adapter appends long CSV chunks under the same field name.
      // FormData preserves their order; ordinary repeated fields retain the
      // existing last-value-wins behaviour.
      if (
        tableFields.has(name.toLowerCase()) &&
        Object.prototype.hasOwnProperty.call(parsed.body, name)
      )
        parsed.body[name] += value
      else parsed.body[name] = value
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
      // an archive carries bytes, so the member says so: without the stamp the
      // package writes the base64 TEXT as the file's content (the encoding field
      // is how a member declares its own representation)
      encoding: 'base64',
      code: toBase64(entry.contents)
    })
  })
  return root
}

// ---------------------------------------------------------------- the routes
/** The bearer token a request carries, if it carries one. */
const bearerOf = (request, query) =>
  (request.headers.get('authorization') || '')
    .replace(/^Bearer\s+/i, '')
    .trim() ||
  String(query.access_token || '').trim() ||
  undefined

/** An exact public-group grant authenticates an otherwise anonymous request. */
const publicGrantOn = (path) => {
  const identity = IDENTITY_STATE.store.snapshot()
  const publicGroup = identity.groups.find((group) => group.name === 'public')
  return Boolean(
    publicGroup &&
    identity.permissions.some(
      (rule) =>
        rule.group === publicGroup.uid &&
        rule.path === path &&
        rule.setting === 'Grant'
    )
  )
}

/** The subject a request is talking as, from its bearer token or the implicit
 * caller when it carries none. Invalid tokens are anonymous on public routes. */
const subjectOf = async (request, query, publicPath, inherited) => {
  const token = bearerOf(request, query)
  if (!token) return inherited ? inherited.subject : IMPLICIT_CALLER
  const subject = await IDENTITY.authenticate(token)
  if (!subject && !(publicPath && publicGrantOn(publicPath)))
    throw new API.ApiError(401, 'Unauthorized')
  return subject || undefined
}

/**
 * One run, answered by the runtime service.
 *
 * The service is called directly rather than through `dispatch` because a run's
 * answer is the webout *with the headers its service declared*
 * (`content-disposition` is how a service names a download), and the artefact
 * the service returns is where those headers are. What a client observes about
 * the request - which field names the program, what `_debug` means, which run
 * times are offered - is still the package's decision; who may run it is not,
 * because it is asked here before this is reached (see `GRANTED_RUN_ROUTES`).
 */
const runRoute = async (
  routeId,
  payload,
  subject,
  sas9 = false,
  tier = false,
  execution
) => {
  // A program may read any file it likes - the drive is its filesystem - so
  // every piece of a sharded drive is fetched here rather than guessed from the
  // request. That is deliberately the whole drive and not just the app being
  // run: replaying a program because a read failed would run its writes twice,
  // so the safe choice costs the download of every other app's bundle the first
  // time anything runs on a cold visit. A page that only lists apps never pays
  // it; the saving this change is for is on that page.
  await R.ensureAll()

  if (
    sas9 &&
    isSasRun(false, undefined, payload.query._program ?? payload.body._program)
  )
    throw new API.ApiError(
      501,
      'SAS execution is unavailable in the browser mock.'
    )

  const query = payload.query
  const body = payload.body
  const tables = payload.files.map((file) => ({
    name: file.name,
    filename: file.filename,
    get csv() {
      return toText(file.contents)
    },
    bytes:
      typeof file.contents === 'string'
        ? new TextEncoder().encode(file.contents)
        : file.contents
  }))
  const code =
    routeId.endsWith('/code/execute') || routeId.endsWith('/code/trigger')
  const trigger = routeId.endsWith('/trigger')
  const vars = Object.assign(Object.create(null), query)
  if (tier && !sas9 && payload.method === 'POST') {
    const queryNames = new Map(
      Object.keys(query).map((key) => [key.toLowerCase(), key])
    )
    for (const [key, value] of Object.entries(body))
      vars[queryNames.get(key.toLowerCase()) || key] = value
    if (query._program !== undefined) vars._program = query._program
  } else Object.assign(vars, body)
  if (sas9)
    vars[SAS9_FRAME] = {
      present: Object.hasOwn(vars, '_debug'),
      value: vars._debug
    }
  if (tier && !sas9) vars[TIER_FRAME] = true
  vars[EXECUTION_FRAME] = execution

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
    runRequest.program = query._program ?? body._program
  }

  // A SAS run is answered here, ahead of the run: this host cannot execute one, so the answer
  // is a session - the project's recording of that program, or the mocked one. `sas` IS one of
  // this host's run times, which is what the Studio reads to offer Run on a `.sas` file, so the
  // check comes before the package would compile the source as JavaScript. A trigger is
  // excluded: it has to answer with the session record the route builds, which a client parses
  // as JSON, so a transcript is not an answer there.
  if (!trigger && isSasRun(code, body.runTime, runRequest.program)) {
    const recording = await transcriptFor(
      code ? recordedProgramIn(body.code, body.runTime) : runRequest.program
    )

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
        // a code run carries no `_debug` and still answers with its log: the
        // package compiles a code run at its own debug level, and the Studio
        // splits the three parts on the separator it writes
        code
          ? true
          : tier && !sas9
            ? tierDebugOn(vars._debug)
            : vars._debug !== undefined
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
  // a route that states a type decided it from what the file IS - a streamed
  // deployment's asset - and that answer wins over the extension's guess
  return new Response(answer.contents, {
    status: answer.status,
    headers: Object.assign(
      { 'content-type': answer.contentType || contentTypeFor(path, binary) },
      answer.headers
    )
  })
}

/**
 * The shards a request names, fetched before it is answered.
 *
 * The drive of a sharded site is not in memory: the build splits a capture so a
 * first page does not download every app's bundle, and a route that reads a path
 * has to ask for the piece holding it. The two query parameters below are where
 * a request names a path outright, which is the common case and the cheap one -
 * whatever a route resolves from the drive itself is left to the retry in
 * `routeRequest`, which knows the path from the read that failed rather than
 * guessing at it from the URL.
 */
const ensureForRequest = async (url, tierQuery) => {
  const paths = []
  for (const name of ['_filePath', '_FILE', '_program']) {
    const value = tierQuery ? tierQuery[name] : url.searchParams.get(name)
    if (value && !Array.isArray(value)) paths.push(value)
  }
  if (paths.length) await R.ensurePaths(paths)
}

/** An OAuth answer: the body the document states, and no caching of a token. */
const oauthJson = (status, body) => {
  const headers = Object.assign(
    {
      'content-type': 'application/json',
      'cache-control': 'no-store',
      pragma: 'no-cache'
    },
    API.emulatedHeaders()
  )

  return new Response(JSON.stringify(body), { status, headers })
}

const oauthError = (status, error, description) => {
  const answer = oauthJson(status, { error, error_description: description })

  // RFC 6749 section 5.2: a 401 for a failed client authentication carries the
  // challenge for the scheme the client used, or a client that retries only when
  // challenged treats the answer as fatal
  if (status === 401 && error === 'invalid_client')
    answer.headers.set('www-authenticate', 'Basic realm="SASLogon"')

  return answer
}

/** The form a token request carries, or its JSON equivalent. */
const readForm = async (request) => {
  const type = request.headers.get('content-type') || ''

  // read without the swallowing helper: a body that cannot be read is the
  // caller's answer to give (`invalid_request`), not an empty form
  if (!type.includes('application/x-www-form-urlencoded')) {
    const parsed = await request.json()

    // `null`, a string or an array parses as valid JSON and is not a form: the
    // field reads below would throw on it, so it is refused the way an
    // unparseable body is
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      throw new Error('The token request body is not a form.')

    return parsed
  }

  const form = Object.create(null)
  for (const [key, value] of new URLSearchParams(
    await request.text()
  ).entries())
    form[key] = value

  return form
}

/**
 * One half of a Basic credential, decoded.
 *
 * A malformed escape is not a credential, so it is returned as written and
 * refused as a wrong one - the alternative is a throw out of the handler, which
 * tells the client nothing.
 */
const decodePart = (value) => {
  try {
    // form semantics, not URI semantics: section 2.3.1 encodes a space as `+`,
    // which `decodeURIComponent` leaves in place
    return decodeURIComponent(value.replace(/\+/g, ' '))
  } catch (error) {
    return value
  }
}

/**
 * The client credentials, from the Basic header a Viya client sends or from the
 * body of a client that posts them instead.
 */
const clientOf = (request, form) => {
  const basic = /^Basic\s+(.+)$/i.exec(
    request.headers.get('authorization') || ''
  )

  if (basic) {
    let decoded = ''

    try {
      decoded = atob(basic[1])
    } catch (error) {
      // a header that is not base64 is not a client: it falls through to the
      // body's credentials, so a malformed header answers like any other bad
      // credential instead of throwing out of the handler as a network error
      decoded = ''
    }

    const separator = decoded.indexOf(':')

    if (separator !== -1)
      // RFC 6749 section 2.3.1: both halves are form-encoded before they are
      // base64'd, so a client whose id or secret carries `:`, `%`, `+` or `&`
      // verifies here as it would on a server. The body path gets this from
      // `URLSearchParams`.
      return {
        clientId: decodePart(decoded.slice(0, separator)),
        clientSecret: decodePart(decoded.slice(separator + 1))
      }
  }

  return {
    clientId: form.client_id || '',
    clientSecret: form.client_secret || ''
  }
}

/**
 * The authorize step: a client sends the browser here, and this host answers a
 * redirect carrying the code.
 *
 * The registered redirect is this site, because that is where the app reads the
 * code from - a mock site has no other address to send it to, and accepting one
 * from the query would make this an open redirect.
 */
const oauthAuthorize = async (url) => {
  const responseType = url.searchParams.get('response_type') || ''

  // the code flow is the one this host answers; an implicit-flow request would
  // otherwise be redirected with a code it never asked for and fail with no
  // diagnostic at all
  if (responseType !== 'code')
    return oauthError(
      400,
      'unsupported_response_type',
      'This host answers the authorization code flow: response_type=code.'
    )

  const clientId = url.searchParams.get('client_id') || ''

  try {
    const code = await IDENTITY.authorize(IMPLICIT_CALLER, clientId)

    // the site's own address, base path included: a site served below the origin
    // root must not send the code outside its own app
    const target = new URL(`${BASE}/`, self.location.origin)
    target.searchParams.set('code', code)

    const state = url.searchParams.get('state')
    if (state) target.searchParams.set('state', state)

    return new Response(null, {
      status: 302,
      headers: Object.assign(
        { location: target.toString(), 'cache-control': 'no-store' },
        API.emulatedHeaders()
      )
    })
  } catch (error) {
    if (error instanceof API.ApiError)
      return oauthError(
        error.status,
        error.status === 403 ? 'invalid_client' : 'invalid_grant',
        error.message
      )

    throw error
  }
}

/**
 * A pair's own id, in the shape the estate mints: 32 hex characters.
 *
 * `@sasjs/api`'s store issues the tokens and no id beside them, and the answer
 * states one so a client can tell two pairs minted in the same second apart -
 * the reason sasjs/server mints its `jti` from 16 random bytes.
 */
const pairId = () => {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16))

  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(
    ''
  )
}

/**
 * The token step: a code, a refresh token or a password buys a pair.
 *
 * The grants are the ones a browser application signs in with; SASLogon also
 * answers `client_credentials` and `jwt-bearer` for service clients, which this
 * host does not stand in for. A client that asks for another gets
 * `unsupported_grant_type` naming these rather than a silent failure. The pair and its lifetimes are the client's own - a token's expiry is
 * a fact about that client, read back from the store rather than invented here.
 */
const oauthToken = async (request) => {
  let form

  try {
    form = await readForm(request)
  } catch (error) {
    // a body that cannot be read is the request's problem, not the host's: it is
    // answered as an OAuth error like every other malformed sign-in, never as a
    // throw out of the handler
    return oauthError(
      400,
      'invalid_request',
      'The token request body could not be read as a form or as JSON.'
    )
  }

  const client = clientOf(request, form)

  if (!client.clientId)
    return oauthError(401, 'invalid_client', 'A client id is required.')

  const registered = await IDENTITY_STATE.store.client(client.clientId)

  if (!registered)
    return oauthError(
      401,
      'invalid_client',
      `The client ${client.clientId} is not registered on this site.`
    )

  // A secret is checked against the record the fixture declares for the client -
  // the store's read answers the client's lifetimes and not its secret, so the
  // comparison reads the snapshot the host persists, the same record with the
  // field a client authenticates with kept out of the read path.
  const declaredSecret = IDENTITY_STATE.secrets.get(client.clientId)

  if (declaredSecret !== undefined) {
    // A fixture that names the public client has stated a secret for it, and a
    // rule about the estate must not overwrite what the site says about itself:
    // the declared secret is the one that verifies, and an empty one is refused
    // like any other wrong secret.
    if (declaredSecret !== client.clientSecret)
      return oauthError(401, 'invalid_client', 'The client secret is wrong.')
  } else if (client.clientId === PUBLIC_CLIENT_ID) {
    // The public client the estate ships holds no secret, so there is nothing to
    // compare against: sasjs/server binds its password grant - and the refresh
    // that follows - to this id with an empty secret, and `@sasjs/adapter` falls
    // back to it whenever a target names no client. A secret offered for it is
    // refused rather than ignored, or naming the client alone would buy a token.
    if (client.clientSecret !== '')
      return oauthError(
        401,
        'invalid_client',
        `The public client ${PUBLIC_CLIENT_ID} carries no secret.`
      )
  } else {
    // verified or refused, never skipped: a client the fixture declares no secret
    // for at all cannot be checked, so it is refused by name. A change to what the
    // fixture carries then shows up as a refusal here rather than as a check that
    // quietly accepts any secret.
    return oauthError(
      401,
      'invalid_client',
      `The identity fixture declares no secret for ${client.clientId}, so its secret cannot be verified.`
    )
  }

  try {
    let pair

    switch (form.grant_type) {
      case 'authorization_code':
        pair = await IDENTITY.token({
          clientId: client.clientId,
          code: form.code
        })
        break
      case 'refresh_token': {
        // The pair belongs to the client it was issued to, and the server checks
        // that before it rotates (`verifyRefreshToken` compares the token's own
        // clientId with the one presented). Without the same check a refresh token
        // minted for a confidential client is redeemable as any other - the public
        // client included, which presents no secret at all - and the answer would
        // state the wrong client's lifetimes. Refused in the server's words, and
        // before the rotation, so a refused attempt leaves the caller's pair live.
        const held = await IDENTITY_STATE.store.readRefresh(form.refresh_token)

        if (held && held.clientId !== client.clientId)
          return oauthError(
            401,
            'invalid_grant',
            'The refresh token was issued for another client.'
          )

        pair = await IDENTITY.refresh(form.refresh_token)
        break
      }
      case 'password': {
        // the credentials are the grant: the account signs in, buys a code and
        // exchanges it - the same path the authorize step's code takes, so the
        // mint-and-save sequence lives in the package and cannot drift from it
        const { user } = await IDENTITY.login({
          username: form.username || '',
          password: form.password || ''
        })
        const subject = { userId: user.uid, clientId: client.clientId }
        const code = await IDENTITY.authorize(subject, client.clientId)

        pair = await IDENTITY.token({ clientId: client.clientId, code })
        break
      }
      default:
        return oauthError(
          400,
          'unsupported_grant_type',
          'This site answers authorization_code, refresh_token and password.'
        )
    }

    return oauthJson(200, {
      access_token: pair.accessToken,
      refresh_token: pair.refreshToken,
      token_type: 'bearer',
      expires_in: registered.accessTokenExpiration,
      refresh_expires_in: registered.refreshTokenExpiration,
      scope: '',
      // the estate's answer carries three more fields than this host used to
      // state: `jti` is the pair's own id, and the two `revocable` flags are what
      // a client reads before it tries a revocation. sasjs/server emits all
      // three (its `tokenResponse`), so a client that branches on them behaves
      // here as it does there. `id_token` is recorded in the estate's shape and
      // minted by neither: an ID token asserts an OpenID Connect identity, and
      // both hosts answer "who is this" with `/identities/users/@currentUser`.
      jti: pairId(),
      revocable: true,
      refresh_revocable: true
    })
  } catch (error) {
    // a refusal from a grant is a grant problem: the client was verified above,
    // so an unknown client or a wrong secret never reaches here
    if (error instanceof API.ApiError)
      return oauthError(error.status, 'invalid_grant', error.message)

    throw error
  }
}

/**
 * One attempt at a request, with the body source a retry can copy again.
 *
 * A Request's body can only be read once, and a retry (see the catch below) is a
 * second read of the same request - so the first attempt keeps an unread copy
 * beside it and every attempt after that is made from a copy of the copy. Only a
 * request with a body needs one, and `source` is what carries it through the
 * recursion.
 *
 * `inherited` is the recursion's other carry: a nested call made by a running
 * service arrives with the caller that started the run, so the child answers
 * for the same account - and retries keep both carries, the body and the
 * caller.
 */
const routeRequest = async (
  request,
  url,
  attempts = 0,
  source = null,
  inherited = null
) => {
  const hasBody = request.method !== 'GET' && request.method !== 'HEAD'
  const replay = hasBody ? source || request.clone() : null
  const path = withoutBase(url.pathname).replace(/\/+$/, '') || '/'
  // `/api` is the short spelling of the API, and `/SASjsApi` the canonical one:
  // both are answered, so the alias is stripped once here and everything below -
  // the route lookup, the drive routes' plain-text refusals, the log - works
  // from one path.
  // The web tier spellings: ours (`/StoredProgram`, which a SASjs build links to)
  // and the estate's (`/SASJobExecution`, which a Viya build bakes in). Neither
  // is in an API table, so the path is translated to the operation it stands
  // for rather than answered twice - `_FILE=` is the drive read (the package
  // decides its typing and its refusal), `_program=` is the run.
  const webTier = /^\/(SASJobExecution|StoredProgram)$/i.test(path)
  const sas9Run = /^\/SASStoredProcess\/do$/i.test(path)
  const tierQuery = webTier || sas9Run
  // URLSearchParams preserves wire order and repeated names. Mirror the web
  // tier's canonical spellings and leave duplicates for destination validation.
  const query = Object.create(null)
  const controls = { _file: '_FILE', _filepath: '_filePath' }
  for (const [key, value] of url.searchParams.entries()) {
    const lower = key.toLowerCase()
    const name = tierQuery
      ? Object.hasOwn(controls, lower)
        ? controls[lower]
        : lower
      : key
    if (tierQuery && Object.hasOwn(query, name))
      query[name] = Array.isArray(query[name])
        ? [...query[name], value]
        : [query[name], value]
    else query[name] = value
  }
  // Presence, not truthiness: the server tests `!== undefined`, and Express
  // parses `_program=` to the empty string, so a request naming both with an
  // empty value is refused there - a `get`-based guard reads the empty string as
  // absent and answers the file instead, which is the disagreement to avoid.
  const namedFile = Object.hasOwn(query, '_FILE')
  const namedProgram = Object.hasOwn(query, '_program')
  // presence decides which branch runs, as it does on the server (`!== undefined`
  // there): an empty `_FILE=` still reaches the read, and the host refuses the
  // empty name - falling through to "not part of the API" would answer a 404 the
  // server never gives
  const askedForFile = webTier && request.method === 'GET' && namedFile
  const askedForProgram = /^\/StoredProgram$/i.test(path) && namedProgram

  // A request naming both is refused before either branch is chosen, in the
  // server's own words - by parameter, and before either tier or method is
  // considered, because that is the order the server checks them in. The mock
  // exists so a host's answers can be reproduced: picking the file here would
  // make the site work on a page the server answers 400 for.
  if (webTier && namedFile && namedProgram)
    return text(TIER_NEEDS_ONE_PARAMETER, 400)

  // Mirror the sasjs/server Viya mock stub in routes/web/sasviya-web.ts: this
  // literal does not execute a program and that router has no auth/run-grant
  // guard. Server startup disallows MOCK_SERVERTYPE in server mode; the real
  // /StoredProgram and /SASjsApi/stp/execute routes remain separately guarded.
  if (/^\/SASJobExecution$/i.test(path) && request.method === 'POST')
    return json({ test: 'test' }, 200)

  const apiPath = sas9Run
    ? '/SASjsApi/stp/execute'
    : askedForFile
      ? '/SASjsApi/drive/file'
      : askedForProgram
        ? '/SASjsApi/stp/execute'
        : path.replace(/^\/api(?=\/|$)/i, '/SASjsApi')

  try {
    // the identity is a file the build shipped, so it is read before anything
    // that needs a caller - a request that arrives before the page has booted
    // (a static asset fetch raced by an API call) must not answer as nobody
    await ensureIdentity()
    await R.ensureReady(askHostForDrive)
    await ensureForRequest(url, tierQuery ? query : null)

    // the sign-in page and the form it posts: a browser, not an API client
    if (apiPath.toLowerCase() === LOGIN_PATH) {
      const answer = await signIn(request, url)
      if (answer) return answer
    }

    // the sign-out a browser follows: the cookie is this host's session, so
    // ending it is this host's answer
    if (apiPath.toLowerCase() === LOGOUT_PATH && request.method === 'GET')
      return await signOut()

    // A Viya-targeted application asks the estate's own paths. They are answered
    // from the package's emulator over the drive this host already holds, which
    // is what makes a Viya build mockable in the browser at all.
    // The OAuth endpoints a Viya client signs in at: the token port is this
    // host's own, as it is on a server running the emulator.
    if (isViyaPath(apiPath)) {
      // the two sign-in endpoints are the host's port; every other estate path
      // is the emulator's
      const signedIn = apiPath.toLowerCase()
      if (signedIn === OAUTH_AUTHORIZE) return await oauthAuthorize(url)
      if (signedIn === OAUTH_TOKEN) return await oauthToken(request)

      return await viyaRequest(request, url, apiPath, inherited)
    }

    // The app stream is the server's own web surface rather than part of the
    // API: the listing, the landing page and the redirect from one to the other
    // are routes sasjs/server answers, and an interface asks for the listing on
    // every visit. Unanswered, those requests reach the static host and the page
    // parses this site's index.html as JSON.
    //
    // `/app` is the spelling the interface links to and the server serves; the
    // canonical `/AppStream` still answers, because a client built before the
    // short paths existed asks for it. `/AppStream` itself redirects to `/app`,
    // exactly as the server redirects it, and every request under either prefix
    // is handed to the package as the short one - so a mock lists and serves what
    // it published at the same URLs, with the same headers, as a server.
    const stream = withoutBase(url.pathname)

    if (/^\/AppStream$/i.test(stream))
      return new Response(null, {
        status: 301,
        headers: { location: `${BASE}${SHORT_APP_STREAM_PATH}` }
      })

    if (/^\/(app|AppStream)(\/|$)/i.test(stream)) {
      // the path the surface matches on includes the site's folder, which is what
      // it builds the answers' URLs from; `/AppStream` is translated to the short
      // spelling so a client built before it existed reaches the same surface
      const page = await appStreamSurface().request({
        method: request.method,
        path: url.pathname.replace(
          /\/AppStream(?=\/|$)/i,
          SHORT_APP_STREAM_PATH
        ),
        // who may see which app, which the surface leaves to the host. The
        // caller is resolved here because this branch answers before the API
        // routes below resolve theirs
        allow: await appFilter(
          await subjectOf(request, query, undefined, inherited)
        )
      })

      // a removal changes the index, which lives in the drive: persisted in the
      // same breath as any other change, or a reload would bring the app back
      if (request.method !== 'GET') await persistChanges()

      const headers = Object.assign({}, page.headers)
      // a location the package states is already inside the folder, because the
      // base it built it from carries it
      if (page.location) headers.location = page.location
      if (page.contentType) headers['content-type'] = page.contentType

      return new Response(
        page.body === undefined || page.body === null ? null : page.body,
        { status: page.status, headers }
      )
    }

    if (/^\/SASStoredProcess$/i.test(path) && request.method === 'GET') {
      const subject = await subjectOf(request, query, undefined, inherited)
      const user =
        subject &&
        IDENTITY_STATE.store
          .snapshot()
          .users.find((candidate) => candidate.uid === subject.userId)
      if (!user) throw new API.ApiError(401, 'Unauthorized')
      // The adapter extracts a title from this probe. JSON encoding prevents a
      // fixture's display name from becoming executable HTML.
      return text(
        `SAS Stored Process\n${JSON.stringify({ title: `Log Off ${user.displayName}` })}`
      )
    }

    // The package's own matcher, so a route is recognised however its path is
    // cased and its parameters are read the way the document states them.
    const matched = API.findRoute(request.method, apiPath)
    if (!matched)
      return json({ message: 'Not part of the API: ' + apiPath }, 404)

    const routeId = matched.route.id
    const token = bearerOf(request, query)
    const routePath = routeId.slice(routeId.indexOf(' ') + 1)
    // The grant inventory preserves fileTree's spelling unlike the route table.
    const publicPath = (API.DEFAULT_GRANTABLE_ROUTES || []).find(
      (candidate) =>
        candidate.toLowerCase() === routePath.toLowerCase() &&
        candidate.toLowerCase().startsWith('/sasjsapi/drive/')
    )
    const subject = SELF_AUTH_ROUTES.has(routeId)
      ? undefined
      : await subjectOf(request, query, publicPath, inherited)
    if (routeId === DEPLOY_UPLOAD) {
      const uploadPath = '/SASjsApi/drive/deploy/upload'
      // Newer packages expose the same decision as dispatch. With older ones,
      // authenticated callers get that decision from their reported routes;
      // an anonymous caller needs an exact public-group grant.
      const allowed = RECORDS.mayUseRoute
        ? await RECORDS.mayUseRoute(subject, uploadPath)
        : subject
          ? (await RECORDS.myAuthorizedRoutes(subject)).paths.includes(
              uploadPath
            )
          : publicGrantOn(uploadPath)
      if (!allowed) throw new API.ApiError(401, 'Unauthorized')
    }
    // Every gated execution route must refuse before parsing upload bytes.
    if (GRANTED_RUN_ROUTES.has(routeId)) {
      const granted = await RECORDS.myAuthorizedRoutes(subject)
      if (!granted.paths.includes(routePath))
        throw new API.ApiError(401, 'Unauthorized')
    }
    // The execution API validates URL values before merging POST fields.
    if (
      (askedForProgram || (sas9Run && request.method === 'POST')) &&
      RUN_ROUTES.has(routeId)
    ) {
      if (Array.isArray(query._debug))
        return text('"_debug" must be one of [number, string]', 400)
      if (query._debug === '')
        return text('"_debug" is not allowed to be empty', 400)
      // SAS9 GET bypasses the upload validator; repeated custom values reach JS.
      for (const [name, value] of Object.entries(query)) {
        if (Array.isArray(value) && name !== '_program' && name !== '_debug')
          throw badRequest(`"${name}" must be one of [string, number]`)
      }
    }
    if (askedForFile && Array.isArray(query._FILE))
      throw badRequest('"_FILE" must be a string')
    if (askedForFile && Array.isArray(query._filePath))
      throw badRequest('"_filePath" must be a string')
    const payload = await readPayload(request, routeId === DEPLOY_UPLOAD)
    payload.query = query
    payload.method = request.method

    // Preserve SAS9 body parameter casing apart from the existing program lookup;
    // URL names were already normalised before authentication and routing.
    if (sas9Run) {
      const bodyProgram = payload.body._program
      const hasLowercaseProgram = Object.hasOwn(payload.body, '_program')
      for (const key of Object.keys(payload.body)) {
        const name = key.toLowerCase()
        // The upload validator accepts a body-only program only as `_program`.
        if (
          name === '_program' &&
          key !== '_program' &&
          request.method === 'POST' &&
          query._program === undefined &&
          !hasLowercaseProgram
        )
          continue
        if (name === '_program') {
          payload.body[name] = hasLowercaseProgram
            ? bodyProgram
            : payload.body[key]
          if (name !== key) delete payload.body[key]
        }
      }
    }

    if (RUN_ROUTES.has(routeId)) {
      const user =
        subject &&
        IDENTITY_STATE.store
          .snapshot()
          .users.find((candidate) => candidate.uid === subject.userId)
      const runToken = token || (inherited && inherited.token)
      const headers = runToken ? `Authorization: Bearer ${runToken}` : ''
      const execution = {
        apiServerUrl: self.location.origin + BASE,
        user: user || { username: '', uid: '', displayName: '' },
        headers,
        fetch: (input, init) => {
          const target = new URL(
            typeof input === 'string' || input instanceof URL
              ? input
              : input.url,
            self.location.origin + BASE + '/'
          )
          const inside =
            !BASE ||
            target.pathname === BASE ||
            target.pathname.startsWith(BASE + '/')
          const path = inside ? withoutBase(target.pathname) : ''
          if (
            target.origin === self.location.origin &&
            inside &&
            isAnswered(path) &&
            !/^\/api\/?$/i.test(path)
          ) {
            const nested = new Request(
              input instanceof Request ? input : target.href,
              init
            )
            return routeRequest(nested, target, 0, null, {
              subject,
              token: runToken
            })
          }
          return fetch(input, init)
        }
      }
      return await runRoute(
        routeId,
        payload,
        subject,
        sas9Run,
        tierQuery,
        execution
      )
    }

    const apiRequest = {
      query,
      params: matched.params,
      subject,
      token,
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

    // A deploy that published an app states its URL against the package's own
    // default mount. This site may be served from a folder, so the answer has to
    // name the URL a reader can actually open - the folder the surface above is
    // mounted under, which is the same base its links are built from.
    if (BASE && answer.body && answer.body.app && answer.body.app.url)
      answer.body.app.url = `${BASE}${answer.body.app.url}`

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
    const response = json(answer.body, answer.status)
    // The page asks this grant before reading SAS9 multipart files. Carry the
    // worker's actual limit on that same response, not a second page constant.
    if (
      routeId === 'GET /SASjsApi/info/myAuthorizedRoutes' &&
      answer.status === 200
    )
      response.headers.set(
        'x-sasjs-mock-max-upload-bytes',
        String(R.MAX_UPLOAD_BYTES)
      )
    return response
  } catch (e) {
    // A read of a file that is still on the site: the route reached a path the
    // request did not name - an app asset, a `.sasjslint` above the edited file,
    // a join a service resolves from the drive. The failure names the path, so
    // the first attempt fetches exactly that piece; a second one in the same
    // request means it wants more than one, so the rest of the drive comes in.
    // Bounded, because a refusal that keeps repeating is a real one.
    if (e && e.code === R.PENDING_CODE && attempts < 2) {
      if (!attempts && e.path) await R.ensurePaths([e.path])
      else await R.ensureAll()
      // a fresh copy per attempt: the one this attempt read is spent
      const next = replay ? replay.clone() : request
      return await routeRequest(next, url, attempts + 1, replay, inherited)
    }

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
    // answers an envelope, the body to send. The deploy routes state one in the
    // document - a refusal there is `{status: 'failure', message}` - while the
    // other drive routes send the message itself as plain text, which is what the
    // server's `res.status(code).send(err.message)` does.
    if (API.isApiError(e)) {
      // Authorization middleware sends a plain-text 401, even for deploy routes.
      if (
        apiPath.toLowerCase().startsWith('/sasjsapi/drive/') &&
        e.status === 401 &&
        e.message === 'Unauthorized'
      )
        return text(e.message, e.status)
      if (e.body !== undefined) return json(e.body, e.status)
      if (/\/SASjsApi\/drive\/deploy(\/|$)/.test(apiPath))
        return json({ status: 'failure', message: e.message }, e.status)
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
  // `/api` and `/api/` on their own are left to the static host: a site's own
  // application can answer that route (this framework's server interface does),
  // and the worker has no business putting an API answer in front of it. Every
  // other `/api/...` is an API call on the short spelling, which routeRequest
  // canonicalises to `/SASjsApi`.
  if (/^\/api\/?$/i.test(path)) return

  if (!isAnswered(path)) return
  event.respondWith(handle(event.request, url))
})

// ------------------------------------------------------------- host messages
self.addEventListener('message', (event) => {
  const data = event.data || {}
  const reply = (message) => event.source && event.source.postMessage(message)

  switch (data.type) {
    case 'sasjs-load':
      event.waitUntil(
        bootIdentity(data)
          .then(() => R.load(data.files || {}, data.deleted || []))
          .then(async () => {
            // From here the payload is accepted and in the drive: a failure to
            // write it back to the other tabs is NOT the worker refusing the
            // data, and reporting it as a `host` refusal would have the page
            // delete a stored drive the worker is serving. It gets its own kind,
            // so a failed broadcast is reported and the drive left alone.
            const persisted = await persistChanges().then(
              () => null,
              (e) => e
            )
            // the request that asked for this drive is waiting on it
            driveArrived('loaded')
            reply({
              type: 'sasjs-load-ack',
              boot: R.bootInfo(),
              stats: R.stats(),
              ...(persisted
                ? {
                    error:
                      (persisted && persisted.message) || String(persisted),
                    errorKind: 'persist'
                  }
                : {})
            })
          })
          .catch((e) =>
            // a persisted fixture this build cannot read is an answer, not a
            // crash: the page drops it and boots from the fixture the site ships.
            // `errorKind` is what tells it which failure this is - a drive that
            // could not be read is not a fixture that could not be read, and
            // dropping the identity for it would discard the visitor's accounts
            reply({
              type: 'sasjs-load-ack',
              error: (e && e.message) || String(e),
              errorKind:
                e && e.identityRejected
                  ? 'identity'
                  : e && e.callerRejected
                    ? 'caller'
                    : 'host'
            })
          )
      )
      break

    case 'sasjs-seed':
      event.waitUntil(
        bootIdentity(data)
          .then(() => R.seed())
          .then(async () => {
            // as in the load ack: the seed is installed, and a failed write-back
            // to the other tabs is a `persist` failure, not a refused seed
            const persisted = await persistChanges().then(
              () => null,
              (e) => e
            )
            // "there is nothing stored" is an answer too: the wait is over and
            // the seeded drive is the visitor's
            driveArrived('seeded')
            reply({
              type: 'sasjs-seed-ack',
              boot: R.bootInfo(),
              stats: R.stats(),
              ...(persisted
                ? {
                    error:
                      (persisted && persisted.message) || String(persisted),
                    errorKind: 'persist'
                  }
                : {})
            })
          })
          .catch((e) =>
            reply({
              type: 'sasjs-seed-ack',
              error: (e && e.message) || String(e),
              errorKind:
                e && e.identityRejected
                  ? 'identity'
                  : e && e.callerRejected
                    ? 'caller'
                    : 'host'
            })
          )
      )
      break

    case 'sasjs-drive-unavailable':
      // the page holds a drive it could not read: not an answer to seed over.
      // `ensureReady` fails the request instead, and the next one asks again.
      driveArrived('unavailable')
      break

    case 'sasjs-reset':
      event.waitUntil(
        ensureIdentity()
          .then(() => {
            // the shipped fixture and the fixture's own administrator: a reset
            // is the state a first visit gets, which includes who is asking
            CALLER_USERNAME = undefined
            seedIdentity(IDENTITY_STATE.shipped)
            return R.reset()
          })
          .then(async () => {
            await persistChanges()
            reply({ type: 'sasjs-reset-ack', boot: R.bootInfo() })
          })
          .catch((e) =>
            // a reset against a site whose shipped fixture cannot be read has to
            // say so: the page waits for this ack, and silence reads as success
            reply({
              type: 'sasjs-reset-ack',
              error: (e && e.message) || String(e)
            })
          )
      )
      break

    /**
     * Signs in as another account, for a reviewer who wants to see the app the
     * way that user sees it.
     *
     * The token pair is real to this host - the store issues it and answers
     * `GET /SASjsApi/session` with it - but it is not a credential in any other
     * sense: nothing signs it and no password is checked. `undefined` (or the
     * literal `admin`) means the fixture's administrator. An unknown or inactive
     * account is refused by name, because a silent fallback to the admin is the
     * one answer a reviewer would read as "it worked".
     */
    case 'sasjs-as': {
      event.waitUntil(
        (async () => {
          try {
            await ensureIdentity()
            const fixture = IDENTITY_STATE.store.snapshot()
            const admin = adminUser()

            const wanted =
              data.username === undefined || data.username === 'admin'
                ? admin && admin.username
                : String(data.username)

            if (!wanted) {
              reply({
                type: 'sasjs-as-ack',
                error:
                  'The identity fixture declares no administrator, so there is no admin to return to.'
              })
              return
            }

            const user = await IDENTITY_STORE.userByName(wanted)

            if (!user) {
              reply({
                type: 'sasjs-as-ack',
                error: `The identity fixture has no account named "${String(
                  data.username
                )}". It holds: ${fixture.users
                  .map((candidate) => candidate.username)
                  .join(', ')}.`
              })
              return
            }

            if (!user.isActive) {
              reply({
                type: 'sasjs-as-ack',
                error: `The account "${user.username}" is not active, so nothing can sign in as it.`
              })
              return
            }

            const client = firstClient()

            if (!client) {
              reply({
                type: 'sasjs-as-ack',
                error:
                  'The identity fixture declares no client, so no token can be issued.'
              })
              return
            }

            const subject = { userId: user.uid, clientId: client.clientId }
            const pair = await IDENTITY_STORE.issue(subject, client)
            await IDENTITY_STORE.savePair(subject, pair)

            CALLER_USERNAME = user.username
            resolveCaller()

            reply({
              type: 'sasjs-as-ack',
              username: user.username,
              accessToken: pair.accessToken,
              refreshToken: pair.refreshToken,
              identity: IDENTITY_STATE.store.snapshot()
            })
          } catch (e) {
            reply({
              type: 'sasjs-as-ack',
              error: (e && e.message) || String(e)
            })
          }
        })()
      )
      break
    }

    case 'sasjs-snapshot':
      // a sharded drive is not all in memory, and the caller is exporting it -
      // for persistence after a change, or as `mock-snapshot.json` for the next
      // build. Whole means whole: the pieces nobody read are fetched first, or
      // the export would quietly lose every app bundle it had not opened.
      event.waitUntil(
        R.ensureReady(askHostForDrive)
          .then(() => R.ensureAll())
          .then(() => reply({ type: 'sasjs-snapshot', files: R.dumpAll() }))
          .catch((e) =>
            reply({
              type: 'sasjs-snapshot',
              files: R.dumpAll(),
              error: (e && e.message) || String(e)
            })
          )
      )
      break

    case 'sasjs-stats':
      event.waitUntil(
        R.ensureReady(askHostForDrive).then(() => {
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
