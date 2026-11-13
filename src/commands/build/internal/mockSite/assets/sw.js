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
// The linter, bundled at build time from the installed @sasjs/api/code and
// @sasjs/lint (see mockSite.ts). It is a separate script because the linter is
// not part of the root package a service worker can import.
const CODE = self.SASjsCode

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

const IDENTITY_STATE = {
  store: new API.MemoryIdentityStore(API.DEFAULT_IDENTITY),
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

  CALLER_USERNAME =
    data.subject === null
      ? null
      : data.subject === undefined
        ? undefined
        : String(data.subject)

  seedIdentity(fixture)
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

/**
 * Hands the page what changed: the drive files the runtime marked dirty, and the
 * identity store's own snapshot when a route changed it.
 *
 * The identity travels as the fixture `snapshot()` emits, which is exactly what
 * a boot seeds from - one shape for the file a person reads, the object the page
 * stores and the store it seeds. It is sent only when it differs from the last
 * report, so a drive-only request carries no fixture and an identity-only change
 * still reaches storage.
 */
const persistChanges = async () => {
  const files = R.takeDirty()
  const fixture = IDENTITY_STATE.store.snapshot()
  const asJson = IDENTITY_STATE.seeded ? JSON.stringify(fixture) : ''
  const identity =
    asJson && asJson !== IDENTITY_STATE.persisted ? fixture : null

  if (identity) IDENTITY_STATE.persisted = asJson

  if (Object.keys(files).length || identity)
    await broadcast({ type: 'sasjs-persist', files, identity })
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
    const params = Object.assign({}, request.vars || {})

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
        params._debug !== undefined
      )
    } else {
      const payload = { params, tables: tablesOf(request.files) }
      if (program.code !== undefined) payload.code = program.code
      else payload.program = program.path

      const result = R.run(payload)
      if (result.error) throw runFailure(result.error)

      artifact = artifactOf(result, params._debug !== undefined)
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

const lintConfig = async (filePath) => {
  // A path that escapes the drive has no folder to walk from, and a buffer that
  // names no file has none either: both take the drive root's rules, which is
  // what a server answers for each - a refused path there falls back to the
  // root file rather than to the linter's defaults.
  let folder = API.dirname(API.normaliseDrivePath(filePath) ?? '/')
  for (;;) {
    const configPath =
      folder === '/' ? `/${LINT_CONFIG_FILE}` : `${folder}/${LINT_CONFIG_FILE}`
    const contents = await DRIVE_STORE.read(configPath).catch(() => null)
    const parsed = parseLintConfig(contents)
    if (parsed) return new CODE.LintConfig(parsed)
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
  code: CODE.createCodeService({ lintConfig })
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

/** The subject a request is talking as, from its bearer token or the implicit
 * caller when it carries none. An unknown token is the package's 401. */
const subjectOf = async (request, query) => {
  const token = bearerOf(request, query)
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
        code ? true : vars._debug !== undefined
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
    // the identity is a file the build shipped, so it is read before anything
    // that needs a caller - a request that arrives before the page has booted
    // (a static asset fetch raced by an API call) must not answer as nobody
    await ensureIdentity()
    await R.ensureReady()

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

    // The package's own matcher, so a route is recognised however its path is
    // cased and its parameters are read the way the document states them.
    const matched = API.findRoute(request.method, apiPath)
    if (!matched)
      return json({ message: 'Not part of the API: ' + apiPath }, 404)

    const routeId = matched.route.id
    const token = bearerOf(request, query)
    const subject = SELF_AUTH_ROUTES.has(routeId)
      ? undefined
      : await subjectOf(request, query)
    const payload = await readPayload(request, routeId === DEPLOY_UPLOAD)
    payload.query = query

    if (RUN_ROUTES.has(routeId))
      return await runRoute(routeId, payload, subject)

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
    // answers an envelope, the body to send. The deploy routes state one in the
    // document - a refusal there is `{status: 'failure', message}` - while the
    // other drive routes send the message itself as plain text, which is what the
    // server's `res.status(code).send(err.message)` does.
    if (API.isApiError(e)) {
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
        bootIdentity(data)
          .then(() => R.load(data.files || {}))
          .then(async () => {
            await persistChanges()
            reply({
              type: 'sasjs-load-ack',
              boot: R.bootInfo(),
              stats: R.stats()
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
              errorKind: e && e.identityRejected ? 'identity' : 'host'
            })
          )
      )
      break

    case 'sasjs-seed':
      event.waitUntil(
        bootIdentity(data)
          .then(() => R.seed())
          .then(async () => {
            await persistChanges()
            reply({
              type: 'sasjs-seed-ack',
              boot: R.bootInfo(),
              stats: R.stats()
            })
          })
          .catch((e) =>
            reply({
              type: 'sasjs-seed-ack',
              error: (e && e.message) || String(e),
              errorKind: e && e.identityRejected ? 'identity' : 'host'
            })
          )
      )
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
