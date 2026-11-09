import path from 'path'
import { DRIVE_CORPUS } from '@sasjs/api'
import type { CorpusCase } from '@sasjs/api'
import os from 'os'
import yazl from 'yazl'
import { buildLintBundle } from '../mockSite'

export {}

/**
 * The other half of the parity claim: the service worker is what turns an
 * /SASjsApi/ request into a response, so its framing (webout body, the _debug
 * log shape, the 400 and the 500) is tested against the file the site ships.
 */
const appLoc = '/Public/app/test'
const origin = 'https://mock.example.com'
const LOGS_SEPARATOR = 'SASJS_LOGS_SEPARATOR_163ee17b6ff24f028928972d80a26784'

const drivePath = (relative: string) =>
  `/sasjs/drive/files${appLoc}/${relative}`

/**
 * The browser build of @sasjs/api that mockSite.ts copies into the site, from the
 * installed package - the worker under test must be the worker the build ships.
 */
const apiBrowserBuild = () =>
  path.join(
    path.dirname(require.resolve('@sasjs/api')),
    '..',
    '..',
    'build',
    'browser.js'
  )

/**
 * The lint bundle the site ships, built once for the suite from the installed
 * packages - the same call `sasjs build` makes, so the worker under test answers
 * the code routes with the code the site carries.
 */
let lintBundlePath: string | undefined
const lintBundle = () => {
  if (!lintBundlePath) {
    lintBundlePath = path.join(os.tmpdir(), `sasjs-lint-${process.pid}.js`)
    buildLintBundle(lintBundlePath)
  }
  return lintBundlePath
}

const loadWorker = (base = '') => {
  jest.resetModules()
  const handlers: { [type: string]: ((event: any) => any)[] } = {}
  let refusingWrites = false
  const self: any = {
    // the worker's own location names the folder the site is served from
    location: { origin, pathname: `${base}/sw.js` },
    addEventListener: (type: string, fn: (event: any) => any) => {
      handlers[type] = handlers[type] || []
      handlers[type].push(fn)
    },
    skipWaiting: () => {},
    // a test can put a client here to observe what the host broadcasts; with
    // none, a message reaches nobody and nothing can be asserted about it
    clients: {
      claim: () => {},
      matchAll: async () => (global as any).__mockHostClients ?? []
    }
  }
  ;(global as any).self = self
  // sw.js imports the runtime and the package by URL; the test loads the same
  // files from source, so the worker here answers with the code the site ships.
  ;(global as any).importScripts = (path: string) => {
    if (path.includes('md5')) return
    if (path.includes('api-browser')) return require(apiBrowserBuild())
    if (path.includes('lint-browser')) {
      // the bundle assigns globalThis.SASjsCode, and this harness keeps the
      // worker's `self` apart from the module global
      require(lintBundle())
      self.SASjsCode = (global as any).SASjsCode
      return
    }
    require('../assets/runtime-core.js')
    // The corpus needs the same drive with its writes refused, without building
    // a second site. The flag is flipped after the case has seeded, because a
    // store that refused during seeding could not be seeded - the package seeds
    // its refusing store through the constructor for the same reason.
    const base = self.SASjsMockRuntime.driveStore
    const refused = () =>
      Promise.reject(new Error('the store refused the write'))
    self.SASjsMockRuntime.driveStore = {
      read: (file: string) => base.read(file),
      exists: (file: string) => base.exists(file),
      stat: (file: string) => base.stat(file),
      list: (folder: string) => base.list(folder),
      remove: (file: string) => base.remove(file),
      move: (from: string, to: string) => base.move(from, to),
      write: (file: string, contents: unknown) =>
        refusingWrites ? refused() : base.write(file, contents),
      mkdirp: (folder: string) =>
        refusingWrites ? refused() : base.mkdirp(folder)
    }
  }
  require('../assets/sw.js')

  // A seed request re-boots the runtime from /host/vfs-seed.json, so the
  // harness answers that one path the way the static host does.
  ;(global as any).fetch = jest.fn(async (input: any) => {
    const target =
      typeof input === 'string' ? input : (input && input.url) || String(input)
    // a navigation back to the site root: the static host's copy of the page
    if (new URL(target, origin).pathname === '/')
      return new Response('<html><body>static page</body></html>', {
        status: 200,
        headers: { 'content-type': 'text/html' }
      })
    if (target.includes('index.html'))
      return new Response(
        '<!doctype html><html><head><title>App</title></head><body>home</body></html>',
        { status: 200, headers: { 'content-type': 'text/html' } }
      )
    if (target.includes('sas-transcript')) {
      const fixture = (global as any).__sasTranscript
      return fixture ? jsonResponse(fixture) : new Response('', { status: 404 })
    }
    return target.includes('vfs-seed')
      ? jsonResponse({
          files: {
            [drivePath('services/public/getdata.js')]: '_webout = "seeded";'
          }
        })
      : jsonResponse({ appLoc })
  })

  const runtime = self.SASjsMockRuntime

  const dispatch = (path: string, init: any = {}) => {
    const request = new Request(
      path.startsWith('http') ? path : origin + path,
      init
    )
    const event: any = {
      request,
      respondWith: (response: any) => {
        event.response = response
      }
    }
    ;(handlers.fetch || [])[0](event)
    return event.response as Promise<Response>
  }

  const message = (data: any) => {
    const replies: any[] = []
    const event: any = {
      data,
      source: { postMessage: (m: any) => replies.push(m) },
      waitUntil: (promise: any) => {
        event.pending = promise
      }
    }
    ;(handlers.message || []).forEach((fn) => fn(event))
    return { replies, pending: event.pending as Promise<any> | undefined }
  }

  const lifecycle = (type: string) => {
    const event: any = { waitUntil: () => {} }
    ;(handlers[type] || []).forEach((fn) => fn(event))
  }

  return {
    runtime,
    dispatch,
    message,
    lifecycle,
    self,
    refuseWrites: (value: boolean) => {
      refusingWrites = value
    }
  }
}

const jsonResponse = (body: any) => ({
  ok: true,
  json: async () => body
})

/** A zip archive of text members, written the way a deploy upload ships one.
 * The first member is stored rather than deflated, so both methods the reader
 * accepts are exercised by the one case. */
const zipOf = (files: { [name: string]: string }) =>
  new Promise<Buffer>((resolve, reject) => {
    const zip = new yazl.ZipFile()
    Object.keys(files).forEach((name, index) =>
      zip.addBuffer(Buffer.from(files[name]), name, {
        compress: index !== 0
      })
    )
    zip.end()
    const chunks: Buffer[] = []
    zip.outputStream.on('data', (chunk: Buffer) => chunks.push(chunk))
    zip.outputStream.on('end', () => resolve(Buffer.concat(chunks)))
    zip.outputStream.on('error', reject)
  })

const runRequest = (body: any) => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body)
})

describe('service worker host', () => {
  afterEach(() => {
    delete (global as any).self
    delete (global as any).importScripts
    delete (global as any).fetch
  })

  const seeded = () => {
    const worker = loadWorker()
    worker.runtime.load({
      [drivePath('services/public/getdata.js')]:
        'console.log("hello"); _webout = "seeded";'
    })
    return worker
  }

  it('returns the webout as the response body', async () => {
    const { dispatch } = seeded()

    const response = await dispatch(
      '/SASjsApi/stp/execute?_program=' +
        encodeURIComponent(`${appLoc}/services/public/getdata`)
    )

    expect(response.status).toBe(200)
    expect(await response.text()).toBe('seeded')
  })

  it('answers a recorded SAS session with its log, listing and webout', async () => {
    // A browser has no SAS binary. A project may ship the transcript of one real
    // session, and a program it names is answered with it - framed the way the
    // adapter and the Studio split the three parts: webout SEP log SEP listing.
    ;(global as any).__sasTranscript = {
      [`${appLoc}/services/public/report.sas`]: {
        webout: '{"SYSSITE":"00000000"}',
        log: 'NOTE: Copyright (c) 2016 by SAS Institute Inc., Cary, NC, USA.',
        print: 'The SAS System\n\n  Obs    customer\n    1    Northwind Ltd'
      }
    }

    const worker = loadWorker()
    worker.runtime.load({
      [drivePath('services/public/report.sas')]: 'data work.class; run;'
    })

    const response = await worker.dispatch(
      '/SASjsApi/stp/execute?_program=' +
        encodeURIComponent(`${appLoc}/services/public/report`) +
        '&_debug=131'
    )

    expect(response.status).toBe(200)

    const body = await response.text()
    expect(body).toContain('NOTE: Copyright')
    expect(body).toContain('Northwind Ltd')
    expect(body).toContain('"SYSSITE":"00000000"')

    delete (global as any).__sasTranscript
  })

  it('gives a recorded run the seeded content type when not debugging', async () => {
    // Without `_debug` the body is the webout alone, and it still has to carry
    // the type a session is seeded with - an empty header set leaves the choice
    // to the browser, which is the case the seed exists to prevent.
    ;(global as any).__sasTranscript = {
      [`${appLoc}/services/public/report.sas`]: {
        webout: '{"SYSSITE":"00000000"}',
        log: 'NOTE: recorded',
        print: 'The SAS System'
      }
    }

    const worker = loadWorker()
    worker.runtime.load({
      [drivePath('services/public/report.sas')]: 'data work.class; run;'
    })

    const response = await worker.dispatch(
      '/SASjsApi/stp/execute?_program=' +
        encodeURIComponent(`${appLoc}/services/public/report`)
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/html')
    expect(await response.text()).toBe('{"SYSSITE":"00000000"}')

    delete (global as any).__sasTranscript
  })

  it('refuses a .sas program no recording names, as it always did', async () => {
    // The recording is data, not a run time. Every other SAS program keeps the
    // refusal the host gave before the recording existed - and in particular is
    // not compiled as JavaScript, which would answer a SyntaxError quoting the
    // SAS source instead of saying the run time is not available.
    const worker = loadWorker()
    worker.runtime.load({
      [drivePath('services/public/other.sas')]: 'data work.class; run;'
    })

    const response = await worker.dispatch(
      '/SASjsApi/stp/execute?_program=' +
        encodeURIComponent(`${appLoc}/services/public/other`)
    )

    expect(response.status).toBe(400)

    const body = await response.text()
    expect(body).toContain('runTime')
    expect(body).not.toContain('SyntaxError')
  })

  /**
   * A worker whose drive holds one service that answers with a download, the
   * way a streaming service does on the server: the body goes to the webout
   * fileref and the headers file says what it is.
   */
  const streaming = (code: string) => {
    const worker = loadWorker()
    worker.runtime.load({
      [drivePath('services/public/download.js')]: code
    })
    return worker
  }

  const downloadPath = (query = '') =>
    '/SASjsApi/stp/execute?_program=' +
    encodeURIComponent(`${appLoc}/services/public/download`) +
    query

  it('applies the content type and disposition a service declared', async () => {
    const { dispatch } = streaming(
      [
        'fs.writeFileSync(_SASJS_WEBOUT_HEADERS, \'Content-type: text/csv \\n Content-Disposition: attachment;filename="users.csv"\')',
        "_webout = 'a,b\\n1,2'"
      ].join('\n')
    )

    const response = await dispatch(downloadPath())

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('text/csv')
    expect(response.headers.get('content-disposition')).toBe(
      'attachment;filename="users.csv"'
    )
    expect(await response.text()).toBe('a,b\n1,2')
  })

  it('serves a byte body as bytes, under the name the service chose', async () => {
    const { dispatch } = streaming(
      [
        'fs.writeFileSync(_SASJS_WEBOUT_HEADERS, \'Content-type: application/zip\\nContent-Disposition: attachment;filename="pack.zip"\')',
        'fs.writeFileSync(weboutPath, Uint8Array.from([80, 75, 3, 4]))'
      ].join('\n')
    )

    const response = await dispatch(downloadPath())

    expect(response.headers.get('content-type')).toBe('application/zip')
    expect(response.headers.get('content-disposition')).toBe(
      'attachment;filename="pack.zip"'
    )
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(
      new Uint8Array([80, 75, 3, 4])
    )
  })

  it('serves a byte body with no declared type as an opaque download', async () => {
    const { dispatch } = streaming(
      'fs.writeFileSync(weboutPath, Uint8Array.from([1, 2, 3]))'
    )

    const response = await dispatch(downloadPath())

    expect(response.headers.get('content-type')).toBe(
      'application/octet-stream'
    )
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(
      new Uint8Array([1, 2, 3])
    )
  })

  it('keeps a header appended without a leading newline on its own line', async () => {
    // the server's JS session seeds the header file with a trailing newline, so an
    // append that assumes one is clean rather than concatenating onto the seed
    const { dispatch } = streaming(
      [
        "fs.appendFileSync(_SASJS_WEBOUT_HEADERS, 'Content-type: application/json')",
        "_webout = '{}'"
      ].join('\n')
    )

    const response = await dispatch(downloadPath())

    expect(response.headers.get('content-type')).toBe('application/json')
    expect(await response.text()).toBe('{}')
  })

  it('keeps a declared type that happens to equal the seed', async () => {
    // a service that writes the seeded value itself has declared it, so a byte
    // body keeps it: only the untouched seed means "nothing declared"
    const { dispatch } = streaming(
      [
        "fs.writeFileSync(_SASJS_WEBOUT_HEADERS, 'content-type: text/html; charset=utf-8')",
        'fs.writeFileSync(weboutPath, Uint8Array.from([1, 2, 3]))'
      ].join('\n')
    )

    const response = await dispatch(downloadPath())

    expect(response.headers.get('content-type')).toBe(
      'text/html; charset=utf-8'
    )
  })

  it('answers text/html for a service that declares no type, as a server does', async () => {
    const { dispatch } = seeded()

    const response = await dispatch(
      '/SASjsApi/stp/execute?_program=' +
        encodeURIComponent(`${appLoc}/services/public/getdata`)
    )

    // The session header file is seeded with the server's line, so a service
    // that assigns _webout and stops answers with a content type instead of
    // leaving the choice to the browser.
    expect(response.headers.get('content-type')).toBe(
      'text/html; charset=utf-8'
    )
    expect(await response.text()).toBe('seeded')
  })

  it('keeps a declared text/html on a byte body, and ignores only the seed', async () => {
    const { dispatch } = streaming(
      [
        "fs.appendFileSync(_SASJS_WEBOUT_HEADERS, '\\nContent-type: text/html')",
        'fs.writeFileSync(weboutPath, Uint8Array.from([1, 2, 3]))'
      ].join('\n')
    )

    const response = await dispatch(downloadPath())

    // only the seeded value is treated as undeclared; the same type written by
    // the service is a declaration and is applied
    expect(response.headers.get('content-type')).toBe('text/html')
  })

  it('keeps a debug reply text, as the body is the framed log', async () => {
    const { dispatch } = streaming(
      [
        'fs.writeFileSync(_SASJS_WEBOUT_HEADERS, \'Content-type: application/zip\\nContent-Disposition: attachment;filename="pack.zip"\')',
        'fs.writeFileSync(weboutPath, Uint8Array.from([80, 75, 3, 4]))'
      ].join('\n')
    )

    const response = await dispatch(downloadPath('&_debug=log'))

    expect(response.headers.get('content-type')).toBe('text/plain')
    expect(response.headers.get('content-disposition')).toBeNull()
    // the body is still bytes, framed with the log rather than corrupted by it
    expect(await response.text()).toBe(
      ['UEsDBA==', LOGS_SEPARATOR, '', LOGS_SEPARATOR].join('\n')
    )
  })

  it('applies nothing it was not asked for, and drops an unusable value', async () => {
    const { dispatch } = streaming(
      [
        "fs.writeFileSync(_SASJS_WEBOUT_HEADERS, 'Cache-Control: no-store\\nContent-type: text/html\\u0000')",
        "_webout = 'plain'"
      ].join('\n')
    )

    const response = await dispatch(downloadPath())

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBeNull()
    // a NUL would make Response throw, so the header is dropped and the body
    // keeps its default type
    expect(response.headers.get('content-type')).toBe(
      'text/plain;charset=UTF-8'
    )
    expect(await response.text()).toBe('plain')
  })

  it('serves a byte file off the drive as bytes', async () => {
    const { runtime, dispatch } = seeded()
    runtime.run({
      code: "fs.writeFileSync('/sasjs/drive/files/data.bin', Uint8Array.from([1, 2, 3]))"
    })

    const response = await dispatch(
      '/SASjsApi/drive/file?_filePath=' + encodeURIComponent('/data.bin')
    )

    expect(response.headers.get('content-type')).toBe(
      'application/octet-stream'
    )
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(
      new Uint8Array([1, 2, 3])
    )
  })

  it('keeps a tab inside a header value, as HTTP allows it', async () => {
    const { dispatch } = streaming(
      [
        'fs.writeFileSync(_SASJS_WEBOUT_HEADERS, \'Content-Disposition: attachment;\\tfilename="a.zip"\')',
        '_webout = "x"'
      ].join('\n')
    )

    const response = await dispatch(downloadPath())

    expect(response.headers.get('content-disposition')).toBe(
      'attachment;\tfilename="a.zip"'
    )
  })

  it('lets the last line for a header win, and an unusable one remove it', async () => {
    const replaced = streaming(
      [
        "fs.writeFileSync(_SASJS_WEBOUT_HEADERS, 'Content-type: text/plain\\nContent-type: application/json')",
        '_webout = "x"'
      ].join('\n')
    )
    expect(
      (await replaced.dispatch(downloadPath())).headers.get('content-type')
    ).toBe('application/json')

    // the server keys its header object by name and deletes a header whose value
    // fails validation, so the mock does the same
    const removed = streaming(
      [
        "fs.writeFileSync(_SASJS_WEBOUT_HEADERS, 'Content-type: text/plain\\nContent-type: text/html\\u0000')",
        '_webout = "x"'
      ].join('\n')
    )
    expect(
      (await removed.dispatch(downloadPath())).headers.get('content-type')
    ).toBe('text/plain;charset=UTF-8')
  })

  it('normalises header names and ignores a line that is not a header', async () => {
    const { dispatch } = streaming(
      [
        'fs.writeFileSync(_SASJS_WEBOUT_HEADERS, \'CONTENT-TYPE: text/plain\\nnot a header\\n: no name\\nContent-Disposition: attachment;filename="a.txt"\')',
        "_webout = 'x'"
      ].join('\n')
    )

    const response = await dispatch(downloadPath())

    expect(response.headers.get('content-type')).toBe('text/plain')
    expect(response.headers.get('content-disposition')).toBe(
      'attachment;filename="a.txt"'
    )
    expect(await response.text()).toBe('x')
  })

  it('serves a service that declares a type but writes no body', async () => {
    const { dispatch } = streaming(
      "fs.writeFileSync(_SASJS_WEBOUT_HEADERS, 'Content-type: application/json')"
    )

    const response = await dispatch(downloadPath())

    expect(response.headers.get('content-type')).toBe('application/json')
    expect(await response.text()).toBe('')
  })

  it('answers the session route with the caller, and names a route it does not have', async () => {
    const { dispatch } = seeded()

    // no credential: this host reads the visitor as the fixture administrator,
    // which is the account the package's session route names
    const session = await dispatch('/SASjsApi/session')
    expect(await session.json()).toEqual({
      uid: 'user-admin',
      username: 'sasjsadmin',
      displayName: 'Demo Admin',
      isAdmin: true,
      needsToUpdatePassword: false
    })

    // a token that does not resolve is still a refusal: the implicit caller is
    // for a request with no credential, not for one with a bad one
    const refused = await dispatch('/SASjsApi/session', {
      headers: { authorization: 'Bearer not-a-token' }
    })
    expect(refused.status).toBe(401)
    expect((await refused.json()).message).toBe('Unauthorized')

    const unknown = await dispatch('/SASjsApi/unknown/route')
    expect(unknown.status).toBe(404)
    expect((await unknown.json()).message).toContain('Not part of the API')
  })

  describe('the API surface the package carries', () => {
    it('answers the sign-in flow, and the record routes as that caller', async () => {
      const worker = seeded()

      const signedIn = await worker.dispatch(
        '/SASLogon/login',
        runRequest({ username: 'sasjsadmin', password: 'Orion123' })
      )
      expect(signedIn.status).toBe(200)
      expect((await signedIn.json()).user.username).toBe('sasjsadmin')

      const refused = await worker.dispatch(
        '/SASLogon/login',
        runRequest({ username: 'sasjsadmin', password: 'nope' })
      )
      expect(refused.status).toBe(401)
      expect((await refused.json()).message).toBe('Invalid Password.')

      // the flow a Default-login adapter follows: authorize (the implicit
      // caller), exchange the code for a token, then call as that subject
      const authorized = await worker.dispatch(
        '/SASLogon/authorize',
        runRequest({ clientId: 'web_app' })
      )
      const { code } = await authorized.json()
      const exchanged = await worker.dispatch(
        '/SASjsApi/auth/token',
        runRequest({ clientId: 'web_app', code })
      )
      const pair = await exchanged.json()
      expect(pair.accessToken).toBeTruthy()

      const users = await worker.dispatch('/SASjsApi/user', {
        headers: { authorization: `Bearer ${pair.accessToken}` }
      })
      expect(
        (await users.json()).map((user: any) => user.username).sort()
      ).toEqual(['sasjsadmin', 'sasjsuser'])
    })

    it('answers the administration records the fixture seeds', async () => {
      const { dispatch } = seeded()

      const groups = await dispatch('/SASjsApi/group')
      expect(
        (await groups.json()).map((group: any) => group.name).sort()
      ).toEqual(['Admins', 'DCGroup'])

      const permissions = await dispatch('/SASjsApi/permission')
      expect((await permissions.json()).length).toBe(3)

      const clients = await dispatch('/SASjsApi/client')
      expect(
        (await clients.json()).map((client: any) => client.clientId).sort()
      ).toEqual(['sasjs', 'web_app'])

      const mine = await dispatch('/SASjsApi/info/myAuthorizedRoutes')
      expect(Object.keys(await mine.json()).length).toBeGreaterThan(0)
    })

    it('answers the Admin reports from the worker activity log', async () => {
      const { dispatch } = seeded()

      // the first request of all: nothing has been logged yet, so there is no
      // file and no mtime to report
      const empty = await dispatch('/SASjsApi/admin/diagnostics')
      expect((await empty.json()).logs).toEqual({
        folder: 'worker memory',
        fileCount: 0,
        totalBytes: 0,
        newestFile: null,
        newestModified: null
      })

      // from here the diagnostics request itself is in the log
      const afterFirst = await dispatch('/SASjsApi/admin/logs')
      expect((await afterFirst.json()).files.length).toBe(1)

      // the file's mtime is the last write, not the moment a report was read:
      // /info was the request immediately before this listing
      await dispatch('/SASjsApi/info')
      const listed = (await (await dispatch('/SASjsApi/admin/logs')).json())
        .files[0]
      const lines = (
        await (await dispatch('/SASjsApi/admin/logs/app.log?lines=20')).json()
      ).content.split('\n')
      const infoLines = lines.filter((line: string) =>
        line.includes('GET /SASjsApi/info 200')
      )
      expect(infoLines.length).toBe(1)
      expect(infoLines[0].startsWith(listed.modified)).toBe(true)

      const diagnostics = await dispatch('/SASjsApi/admin/diagnostics')
      expect(diagnostics.status).toBe(200)
      const report = await diagnostics.json()
      expect(report.server.mode).toBe('browser')
      expect(report.filesystem).toBeNull()
      expect(report.logs.fileCount).toBe(1)
      expect(typeof report.memory.heapTotalBytes).toBe('number')

      const logs = await dispatch('/SASjsApi/admin/logs')
      expect((await logs.json()).files.map((file: any) => file.name)).toEqual([
        'app.log'
      ])

      const tail = await dispatch('/SASjsApi/admin/logs/app.log?lines=5')
      const tailBody = await tail.json()
      expect(tail.status).toBe(200)
      expect(tailBody.content).toContain('GET /SASjsApi/info 200')

      // the package's name rule (a bare name ending in .log) and its 404 for a
      // name the folder does not hold
      const wrongName = await dispatch('/SASjsApi/admin/logs/secret.txt')
      expect(wrongName.status).toBe(400)
      const missing = await dispatch('/SASjsApi/admin/logs/other.log')
      expect(missing.status).toBe(404)
    })

    it('imports the fixture directory, and unpublishes the site itself', async () => {
      const { dispatch } = seeded()

      // every account and group the source names is already present
      const synced = await dispatch(
        '/SASjsApi/authConfig/synchroniseWithLDAP',
        { method: 'POST' }
      )
      expect(synced.status).toBe(200)
      expect(await synced.json()).toEqual({ userCount: 0, groupCount: 0 })

      const unpublished = await dispatch('/SASjsApi/drive/deploy', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          streamServiceName: 'Test',
          appLoc
        })
      })
      expect(unpublished.status).toBe(200)
      expect(await unpublished.json()).toEqual({ status: 'success' })

      const other = await dispatch('/SASjsApi/drive/deploy', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          streamServiceName: 'Other',
          appLoc: '/Public/app/other'
        })
      })
      expect(other.status).toBe(404)
    })

    it('lints and formats a buffer with the bundled linter', async () => {
      const { dispatch } = seeded()

      const linted = await dispatch(
        '/SASjsApi/code/lint',
        runRequest({ code: 'data a;\nrun;\n' })
      )
      expect(linted.status).toBe(200)
      const diagnostics = await linted.json()
      expect(Array.isArray(diagnostics)).toBe(true)
      expect(diagnostics.length).toBeGreaterThan(0)
      expect(diagnostics[0].message).toContain('Doxygen')

      const formatted = await dispatch(
        '/SASjsApi/code/format',
        runRequest({ code: 'data a;set b;run;' })
      )
      expect(formatted.status).toBe(200)
      expect(await formatted.text()).toContain('@brief')
    })

    it('answers every route under the folder the site is published in', async () => {
      const worker = loadWorker('/demo')
      worker.runtime.load({
        [drivePath('services/public/getdata.js')]: '_webout = "seeded";'
      })

      // the adapter is pointed at /demo, so the worker sees the folder prefix
      const info = await worker.dispatch('/demo/SASjsApi/info')
      expect(info.status).toBe(200)
      expect((await info.json()).mode).toBe('desktop')

      const page = await worker.dispatch('/demo/')
      expect(page.status).toBe(200)
      expect(page.headers.get('content-type')).toContain('text/html')

      // the folder itself, with no trailing slash, is the home page too
      const folder = await worker.dispatch('/demo')
      expect(folder.status).toBe(200)
      expect(folder.headers.get('content-type')).toContain('text/html')

      // the app stream answers are decided on the path with its trailing slash,
      // so the folder has to come off before that, and the redirect has to stay
      // inside it. The canonical root redirects to the short path, as the server
      // does.
      const stream = await worker.dispatch('/demo/AppStream')
      expect(stream.status).toBe(301)
      expect(stream.headers.get('location')).toBe('/demo/app')

      const landing = await worker.dispatch('/demo/app')
      expect(landing.status).toBe(200)
      expect(landing.headers.get('content-type')).toContain('text/html')

      const apps = await worker.dispatch('/demo/app/apps.json')
      expect(apps.status).toBe(200)
      expect(await apps.json()).toEqual({ apps: [] })

      // the API answers on the short spelling too, inside the folder
      const aliased = await worker.dispatch('/demo/api/info')
      expect(aliased.status).toBe(200)
      expect((await aliased.json()).mode).toBe('desktop')

      // a path outside the folder is not the site's to answer
      expect(worker.dispatch('/other/SASjsApi/info')).toBeUndefined()
    })

    it('serves the build page at the home route, and falls back when it fails', async () => {
      const worker = seeded()

      const response = await worker.dispatch('/')

      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toContain('text/html')
      expect(await response.text()).toContain('<body>home</body>')

      // a home route that fails must not take the page down: the navigation
      // falls back to the static host, which holds the same document
      const runtime = (worker as any).self.SASjsMockRuntime
      const original = runtime.ensureReady
      runtime.ensureReady = async () => {
        throw new Error('home route exploded')
      }
      try {
        const fallback = await worker.dispatch('/')
        expect(fallback.status).toBe(200)
        const body = await fallback.text()
        expect(body).toContain('static page')
        expect(body).not.toContain('home route exploded')
      } finally {
        runtime.ensureReady = original
      }
    })

    it('matches a path whatever its casing, as the API does', async () => {
      const { dispatch } = seeded()

      const response = await dispatch('/sasjsapi/INFO')

      expect(response.status).toBe(200)
      expect((await response.json()).mode).toBe('desktop')
    })

    it('starts a session, then reads its state, log and output', async () => {
      const { dispatch } = seeded()
      const program = encodeURIComponent(`${appLoc}/services/public/getdata`)

      const triggered = await dispatch(
        '/SASjsApi/stp/trigger?_program=' + program,
        runRequest({ params: {} })
      )
      expect(triggered.status).toBe(200)
      const { sessionId } = await triggered.json()
      expect(sessionId).toBeTruthy()

      const state = await dispatch(`/SASjsApi/session/${sessionId}/state`)
      expect(await state.json()).toEqual({ state: 'completed' })

      // the artefact the run produced, under the type its service declared
      const output = await dispatch(`/SASjsApi/session/${sessionId}/output`)
      expect(output.status).toBe(200)
      expect(await output.text()).toBe('seeded')

      const log = await dispatch(`/SASjsApi/session/${sessionId}/log`)
      expect(log.status).toBe(200)

      // a session id nobody ran is the 404 that hides whether it exists
      const missing = await dispatch('/SASjsApi/session/not-a-session/state')
      expect(missing.status).toBe(404)
    })

    it('keeps a trigger a JSON answer, not the recorded transcript', async () => {
      // A recording answers a run, not a trigger: the trigger route answers with
      // the session record a client parses as JSON, so returning the framed
      // webout there would break triggerProgram and the Studio.
      ;(global as any).__sasTranscript = {
        [`${appLoc}/services/public/report.sas`]: {
          webout: '{"SYSSITE":"00000000"}',
          log: 'NOTE: recorded',
          print: 'The SAS System'
        }
      }

      const worker = loadWorker()
      worker.runtime.load({
        [drivePath('services/public/report.sas')]: 'data work.class; run;'
      })

      const response = await worker.dispatch(
        '/SASjsApi/stp/trigger?_program=' +
          encodeURIComponent(`${appLoc}/services/public/report`),
        runRequest({ params: {} })
      )

      expect(response.headers.get('content-type')).toContain('application/json')

      const body = await response.json()
      expect(body).not.toHaveProperty('webout')

      delete (global as any).__sasTranscript
    })

    it('refuses a deploy upload with no archive, and one that is not a zip', async () => {
      const { dispatch } = seeded()

      const empty = await dispatch('/SASjsApi/drive/deploy/upload', {
        method: 'POST',
        body: new FormData()
      })
      expect(empty.status).toBe(400)
      expect(await empty.text()).toBe('"file" is not present.')

      const form = new FormData()
      form.set('file', new Blob([new Uint8Array([1, 2, 3])]), 'not-a-zip.zip')
      const notZip = await dispatch('/SASjsApi/drive/deploy/upload', {
        method: 'POST',
        body: form
      })
      expect(notZip.status).toBe(400)
      expect(await notZip.text()).toBe('The archive is not a zip file.')
    })

    it('takes a token from the query when a link cannot carry a header', async () => {
      const worker = seeded()

      const authorized = await worker.dispatch(
        '/SASLogon/authorize',
        runRequest({ clientId: 'web_app' })
      )
      const { code } = await authorized.json()
      const exchanged = await worker.dispatch(
        '/SASjsApi/auth/token',
        runRequest({ clientId: 'web_app', code })
      )
      const pair = await exchanged.json()

      const users = await worker.dispatch(
        `/SASjsApi/user?access_token=${encodeURIComponent(pair.accessToken)}`
      )

      expect(users.status).toBe(200)
      expect((await users.json()).length).toBe(2)
    })

    it('names a table the page did not name, and takes an archive under any field', async () => {
      const worker = seeded()
      worker.runtime.load({
        [drivePath('services/public/echo.js')]:
          '_webout = _WEBIN_NAME1 + "|" + _WEBIN_FILEREF1;'
      })

      const unnamed = await worker.dispatch(
        '/SASjsApi/stp/execute?_program=' +
          encodeURIComponent(`${appLoc}/services/public/echo`),
        runRequest({ params: {}, tables: [{ csv: 'A,B\r\n1,2' }] })
      )
      expect(await unnamed.text()).toBe('table1|A,B\r\n1,2')

      const form = new FormData()
      form.set('appLoc', appLoc)
      form.set(
        'archive',
        new Blob([new Uint8Array(await zipOf({ 'x.txt': 'x' }))]),
        'deploy.zip'
      )
      const upload = await worker.dispatch('/SASjsApi/drive/deploy/upload', {
        method: 'POST',
        body: form
      })
      expect(upload.status).toBe(200)
    })

    it('expands an uploaded archive into the drive', async () => {
      const { dispatch } = seeded()
      const archive = await zipOf({
        'services/public/run.js': '_webout = "deployed";',
        'docs/readme.txt': 'hello'
      })

      const form = new FormData()
      form.set('appLoc', appLoc)
      form.set('file', new Blob([new Uint8Array(archive)]), 'deploy.zip')
      const response = await dispatch('/SASjsApi/drive/deploy/upload', {
        method: 'POST',
        body: form
      })
      expect(response.status).toBe(200)

      const tree = await dispatch(
        '/SASjsApi/drive/filetree?_folderPath=' + encodeURIComponent(appLoc)
      )
      const listing = JSON.stringify(await tree.json())
      expect(listing).toContain('run.js')
      expect(listing).toContain('readme.txt')

      const file = await dispatch(
        '/SASjsApi/drive/file?_filePath=' +
          encodeURIComponent(`${appLoc}/docs/readme.txt`)
      )
      expect(await file.text()).toBe('hello')
    })
  })

  it('writes a binary upload as its bytes, not as the text it decodes to', async () => {
    const { dispatch } = seeded()

    // what the page bridge posts for a file it could not read as UTF-8
    const image = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a
    ])

    const created = await dispatch('/SASjsApi/drive/file', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        params: { filePath: '/Public/logo.png' },
        tables: [
          {
            name: 'file',
            filename: 'logo.png',
            csv: btoa(String.fromCharCode.apply(null, Array.from(image))),
            binary: true
          }
        ]
      })
    })

    expect(created.status).toBe(200)

    const read = await dispatch(
      '/SASjsApi/drive/file?_filePath=' + encodeURIComponent('/Public/logo.png')
    )

    expect(read.status).toBe(200)
    expect(new Uint8Array(await read.arrayBuffer())).toEqual(image)
  })

  /**
   * A refusal is the API's answer, and the page that asked gets it. Reporting it
   * as a host error put console errors on screens that had handled the refusal
   * themselves - Studio's 409 being the one that started this.
   */
  it('reports a host failure to the page, and stays quiet about a refusal', async () => {
    const worker = seeded()
    const messages: any[] = []
    ;(global as any).__mockHostClients = [
      { postMessage: (message: any) => messages.push(message) }
    ]

    const write = () => {
      const form = new FormData()
      form.set('file', new Blob(['x']), 'new.txt')
      return worker.dispatch(
        '/SASjsApi/drive/file?_filePath=' +
          encodeURIComponent('/Public/new.txt'),
        { method: 'POST', body: form }
      )
    }
    const hostErrors = () =>
      messages.filter((message) => message.type === 'sasjs-host-error').length

    // a drive that cannot be written: a failure of the host, not an answer
    worker.refuseWrites(true)
    const failed = await write()
    expect(failed.status).toBeGreaterThanOrEqual(500)
    expect(hostErrors()).toBe(1)

    // a create over a file that is already there: the API answered, and the
    // caller handles it
    messages.length = 0
    worker.refuseWrites(false)
    expect((await write()).status).toBe(200)
    expect((await write()).status).toBe(409)
    expect(hostErrors()).toBe(0)

    delete (global as any).__mockHostClients
  })

  it('keeps the payload of a JSON body the page bridge forwarded', async () => {
    const { dispatch } = seeded()

    // what host/intercept.js posts for a request the app made with a JSON body:
    // no fields for the envelope, and the payload under `json`. The linter is the
    // sharpest answer to "did the body arrive": with no code it refuses with 400,
    // and with the code it answers findings.
    const body = JSON.stringify({
      params: {},
      tables: [],
      json: { code: 'data _null_;\n  x = 1; \nrun;\n', filePath: '/a.sas' }
    })

    const response = await dispatch('/SASjsApi/code/lint', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body
    })

    expect(response.status).toBe(200)

    // the finding for the trailing space is only reachable if THAT text arrived,
    // which is what the bridge's envelope would otherwise have dropped
    const findings = await response.json()
    expect(Array.isArray(findings)).toBe(true)
    expect(JSON.stringify(findings)).toContain('trailing spaces')
  })

  it('answers 404 for a drive file the drive does not hold', async () => {
    const { dispatch } = seeded()

    const response = await dispatch(
      '/SASjsApi/drive/file?_filePath=' + encodeURIComponent('/missing.txt')
    )

    expect(response.status).toBe(404)
    expect(await response.text()).toBe(`File doesn't exist.`)
  })

  it('answers the app stream on the short path, and the canonical one as an alias', async () => {
    const { dispatch } = seeded()

    // The listing is the server's web route rather than the API's, and an
    // interface asks for it on every visit: unanswered, the request reaches the
    // static host and the page parses index.html as JSON. `/app` is the default
    // spelling; `/AppStream` answers too, because a client built before the short
    // paths existed asks for it.
    for (const path of ['/app/apps.json', '/AppStream/apps.json']) {
      const listing = await dispatch(path)
      expect(listing.status).toBe(200)
      expect(await listing.json()).toEqual({ apps: [] })
    }

    // The landing page answers on the short path, with or without the slash, and
    // the canonical root redirects to it - exactly as sasjs/server redirects it.
    for (const path of ['/app', '/app/', '/app/index.html']) {
      const landing = await dispatch(path)
      expect(landing.status).toBe(200)
      expect(landing.headers.get('content-type')).toContain('text/html')
      expect(await landing.text()).toContain('serves no apps')
    }

    const root = await dispatch('/AppStream')
    expect(root.status).toBe(301)
    expect(root.headers.get('location')).toBe('/app')

    const canonicalLanding = await dispatch('/AppStream/')
    expect(canonicalLanding.status).toBe(200)
    expect(await canonicalLanding.text()).toContain('serves no apps')

    // A name under either spelling is a missing app, which the server also
    // refuses.
    for (const path of ['/app/Demo/', '/AppStream/Demo/']) {
      const app = await dispatch(path)
      expect(app.status).toBe(404)
      expect((await app.json()).message).toContain('serves no apps')
    }
  })

  it('answers the API on /api as well as on /SASjsApi', async () => {
    const { dispatch } = seeded()

    // The short spelling is the default one now, so a client that uses it has to
    // get the same answers - not a 404 from the static host.
    const canonical = await dispatch('/SASjsApi/info')
    const short = await dispatch('/api/info')

    expect(short.status).toBe(200)
    expect(await short.json()).toEqual(await canonical.json())

    // A refusal keeps its shape on the alias: the drive routes answer plain
    // text, not the JSON envelope the other routes use. That branch keys on the
    // path, so it has to see the canonical spelling.
    const missing = await dispatch(
      '/api/drive/file?_filePath=' + encodeURIComponent('/missing.txt')
    )
    expect(missing.status).toBe(404)
    expect(missing.headers.get('content-type')).toContain('text/plain')
    expect(await missing.text()).toBe(`File doesn't exist.`)

    // The documentation page is a file the build copies into the site, so the
    // worker leaves `/api` and `/api/` to the static host instead of answering
    // them as routes.
    expect(dispatch('/api')).toBeUndefined()
    expect(dispatch('/api/')).toBeUndefined()
  })

  it('leaves a request to another origin alone', () => {
    const { dispatch } = seeded()

    expect(dispatch('https://other.example.com/SASjsApi/info')).toBeUndefined()
  })

  it('passes a latin1 header value through as written, and drops one Response cannot carry', async () => {
    const accented = streaming(
      [
        'fs.writeFileSync(_SASJS_WEBOUT_HEADERS, \'Content-Disposition: attachment;filename="r\\u00e9sum\\u00e9.csv"\')',
        "_webout = 'x'"
      ].join('\n')
    )
    const kept = await accented.dispatch(downloadPath())
    expect(kept.headers.get('content-disposition')).toBe(
      'attachment;filename="r\u00e9sum\u00e9.csv"'
    )

    // above U+00FF the Response constructor would throw, so the header goes and
    // the body is still served
    const beyond = streaming(
      [
        'fs.writeFileSync(_SASJS_WEBOUT_HEADERS, \'Content-Disposition: attachment;filename="\\u{1F600}.csv"\')',
        "_webout = 'x'"
      ].join('\n')
    )
    const dropped = await beyond.dispatch(downloadPath())
    expect(dropped.status).toBe(200)
    expect(dropped.headers.get('content-disposition')).toBeNull()
  })

  it('answers 500 when a byte entry on the drive is not valid base64', async () => {
    const worker = loadWorker()
    worker.runtime.load({
      [drivePath('data.bin')]: '\u0000base64:!!!not base64!!!'
    })

    const response = await worker.dispatch(
      '/SASjsApi/drive/file?_filePath=' +
        encodeURIComponent(`${appLoc}/data.bin`)
    )

    expect(response.status).toBe(500)
    expect(await response.text()).toContain('Corrupt binary entry')
  })

  it('frames the log behind the separator when _debug is set', async () => {
    const { dispatch } = seeded()

    const response = await dispatch(
      '/SASjsApi/stp/execute?_program=' +
        encodeURIComponent(`${appLoc}/services/public/getdata`) +
        '&_debug=log'
    )

    // the log lands between the separators, not the empty string the framing
    // would produce if the lines were dropped
    expect(await response.text()).toBe(
      ['seeded', LOGS_SEPARATOR, 'hello', LOGS_SEPARATOR].join('\n')
    )
  })

  it('answers 400 when a request names neither a program nor code', async () => {
    const { dispatch } = seeded()

    const response = await dispatch('/SASjsApi/stp/execute')

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ message: '"_program" is required' })
  })

  it('answers the documented failure envelope when the service throws', async () => {
    const { runtime, dispatch } = seeded()
    runtime.load({
      [drivePath('services/public/broken.js')]: 'throw new Error("boom")'
    })

    const response = await dispatch(
      '/SASjsApi/stp/execute?_program=' +
        encodeURIComponent(`${appLoc}/services/public/broken`)
    )
    const body = await response.json()

    // the package's decision, and the server's: a run that failed is a 400
    // carrying the failure envelope, not a 500 that blames the transport
    expect(response.status).toBe(400)
    expect(body.status).toBe('failure')
    expect(body.message).toBe('Job execution failed.')
    expect(body.error).toContain('boom')
  })

  it('runs code carried by a code/execute request', async () => {
    const { dispatch } = seeded()

    const response = await dispatch(
      '/SASjsApi/code/execute',
      runRequest({ code: '_webout = "inline";', runTime: 'js', params: {} })
    )

    // a code route's documented body is the webout framed with the log, so the
    // run's output is the first section rather than the whole body
    expect((await response.text()).split(LOGS_SEPARATOR)[0].trim()).toBe(
      'inline'
    )
  })

  it('reads the table envelope the page bridge posts for an XHR', async () => {
    const worker = seeded()
    worker.runtime.load({
      [drivePath('services/public/echo.js')]:
        '_webout = _WEBIN_NAME1 + "|" + _WEBIN_FILEREF1;'
    })

    const response = await worker.dispatch(
      '/SASjsApi/stp/execute?_program=' +
        encodeURIComponent(`${appLoc}/services/public/echo`),
      runRequest({
        params: {},
        tables: [
          {
            name: 'SASControlTable',
            filename: 'SASControlTable.csv',
            csv: 'A,B\r\n1,2'
          }
        ]
      })
    )

    // the bridge hands the worker `{params, tables}`; a stored program sees the
    // tables as its _WEBIN variables, not as one `tables` session variable
    expect(await response.text()).toBe('SASControlTable|A,B\r\n1,2')
  })

  it('serves a file off the drive', async () => {
    const { dispatch } = seeded()

    const response = await dispatch(
      '/SASjsApi/drive/file?_filePath=' +
        encodeURIComponent(`${appLoc}/services/public/getdata.js`)
    )

    expect(await response.text()).toBe(
      'console.log("hello"); _webout = "seeded";'
    )
  })

  it('answers the API info and drive routes', async () => {
    const { dispatch } = seeded()

    const info = await dispatch('/SASjsApi/info')
    // the documented body, field for field, in the values @sasjs/api's
    // BROWSER_INFO states: a property the document does not state, or a login
    // form told there are accounts when there are none, is this host describing
    // an API the server does not serve
    expect(await info.json()).toEqual({
      mode: 'desktop',
      cors: 'disable',
      httpPort: null,
      httpsPort: null,
      runTimes: ['js'],
      authProviders: [],
      localLoginEnabled: false,
      version: 'dev'
    })

    const folder = await dispatch(
      '/SASjsApi/drive/folder?_folderPath=' +
        encodeURIComponent(`${appLoc}/services/public`)
    )
    expect((await folder.json()).files).toContain('getdata.js')

    const tree = await dispatch('/SASjsApi/drive/filetree')
    expect(JSON.stringify(await tree.json())).toContain('getdata.js')
  })

  it('accepts a multipart request body', async () => {
    const { dispatch } = seeded()

    const form = new FormData()
    form.append('_program', `${appLoc}/services/public/getdata`)

    const response = await dispatch('/SASjsApi/stp/execute', {
      method: 'POST',
      body: form
    })

    expect(await response.text()).toBe('seeded')
  })

  it('acknowledges a load, a seed, a reset and a snapshot from the page', async () => {
    const { message, runtime } = seeded()
    const files = { [drivePath('services/public/other.js')]: '_webout = "x";' }

    const load = message({ type: 'sasjs-load', files })
    await load.pending
    expect(load.replies[0]).toEqual(
      expect.objectContaining({ type: 'sasjs-load-ack' })
    )

    const seed = message({ type: 'sasjs-seed' })
    await seed.pending
    expect(seed.replies[0]).toEqual(
      expect.objectContaining({ type: 'sasjs-seed-ack' })
    )

    runtime.load(files)
    const snapshot = message({ type: 'sasjs-snapshot' })
    expect(snapshot.replies[0].type).toBe('sasjs-snapshot')
    expect(Object.keys(snapshot.replies[0].files).length).toBe(1)

    const reset = message({ type: 'sasjs-reset' })
    await reset.pending
    expect(reset.replies[0]).toEqual(
      expect.objectContaining({ type: 'sasjs-reset-ack' })
    )

    const stats = message({ type: 'sasjs-stats' })
    await stats.pending
    expect(stats.replies[0]).toEqual(
      expect.objectContaining({ type: 'sasjs-stats' })
    )
  })

  it('reports a corrupt entry in the stats reply rather than leaving the page waiting', async () => {
    const worker = loadWorker()
    worker.runtime.load({
      [drivePath('data.bin')]: '\u0000base64:!!!not base64!!!'
    })

    const stats = worker.message({ type: 'sasjs-stats' })
    await stats.pending

    expect(stats.replies[0]).toEqual(
      expect.objectContaining({
        type: 'sasjs-stats',
        error: expect.stringContaining('Corrupt binary entry')
      })
    )
  })

  it('claims the clients on install and activate', () => {
    const { lifecycle } = seeded()

    expect(() => lifecycle('install')).not.toThrow()
    expect(() => lifecycle('activate')).not.toThrow()
  })

  it('leaves requests outside /SASjsApi/ to the static host', () => {
    const { dispatch } = seeded()

    expect(dispatch('/index.html')).toBeUndefined()
  })

  describe('drive writes', () => {
    /**
     * The response as a client sees it. A drive refusal is plain text (the
     * server sends `res.status(code).send(err.message)`), a success is JSON.
     */
    const answer = async (response: Promise<Response>) => {
      const resolved = await response
      const type = resolved.headers.get('content-type') || ''
      return {
        status: resolved.status,
        body: type.includes('application/json')
          ? await resolved.json()
          : await resolved.text()
      }
    }

    it('answers a drive refusal as text, the way the server sends one', async () => {
      const { dispatch } = seeded()

      const response = await dispatch(
        '/SASjsApi/drive/file?_filePath=' +
          encodeURIComponent('/data/missing.csv')
      )

      // the server's drive routes answer `res.status(code).send(err.message)`,
      // and its own suite asserts `res.text` - so a client that reads the body
      // as text must get the message here too, not a JSON envelope
      expect(response.status).toBe(404)
      expect(response.headers.get('content-type')).toContain('text/plain')
      expect(await response.text()).toBe(`File doesn't exist.`)
    })

    it('creates a file, which the drive then serves', async () => {
      const { dispatch } = seeded()

      const created = await answer(
        dispatch(
          '/SASjsApi/drive/file?_filePath=' +
            encodeURIComponent('/data/users.csv'),
          (() => {
            const form = new FormData()
            form.set('file', new Blob(['id,name\n1,Ann\n']), 'users.csv')
            return { method: 'POST', body: form }
          })()
        )
      )

      expect(created).toEqual({ status: 200, body: { status: 'success' } })

      const read = await dispatch(
        '/SASjsApi/drive/file?_filePath=' +
          encodeURIComponent('/data/users.csv')
      )
      expect(await read.text()).toBe('id,name\n1,Ann\n')
    })

    it('creates a file at the path in the form when the query has none', async () => {
      const { dispatch } = seeded()
      const form = new FormData()
      form.set('file', new Blob(['x']), 'x.txt')
      form.set('filePath', '/data/from-form.txt')

      const created = await answer(
        dispatch('/SASjsApi/drive/file', { method: 'POST', body: form })
      )

      expect(created.body).toEqual({ status: 'success' })
      const read = await dispatch(
        '/SASjsApi/drive/file?_filePath=' +
          encodeURIComponent('/data/from-form.txt')
      )
      expect(await read.text()).toBe('x')
    })

    it('answers 409 for a create over an existing file, 404 for a replace of a missing one', async () => {
      const { dispatch } = seeded()
      const form = () => {
        const f = new FormData()
        f.set('file', new Blob(['x']), 'x.csv')
        return f
      }

      await dispatch(
        '/SASjsApi/drive/file?_filePath=' + encodeURIComponent('/data/x.csv'),
        { method: 'POST', body: form() }
      )
      const again = await answer(
        dispatch(
          '/SASjsApi/drive/file?_filePath=' + encodeURIComponent('/data/x.csv'),
          { method: 'POST', body: form() }
        )
      )
      expect(again.status).toBe(409)
      expect(again.body).toEqual('File already exists.')

      const missing = await answer(
        dispatch(
          '/SASjsApi/drive/file?_filePath=' +
            encodeURIComponent('/data/missing.csv'),
          { method: 'PATCH', body: form() }
        )
      )
      expect(missing.status).toBe(404)
      expect(missing.body).toEqual(`File doesn't exist.`)
    })

    it('replaces a file and deletes one', async () => {
      const { dispatch } = seeded()
      const form = new FormData()
      form.set('file', new Blob(['v1']), 'v.csv')
      await dispatch(
        '/SASjsApi/drive/file?_filePath=' + encodeURIComponent('/data/v.csv'),
        { method: 'POST', body: form }
      )

      const replacement = new FormData()
      replacement.set('file', new Blob(['v2']), 'v.csv')
      const replaced = await answer(
        dispatch(
          '/SASjsApi/drive/file?_filePath=' + encodeURIComponent('/data/v.csv'),
          { method: 'PATCH', body: replacement }
        )
      )
      expect(replaced.body).toEqual({ status: 'success' })

      const read = await dispatch(
        '/SASjsApi/drive/file?_filePath=' + encodeURIComponent('/data/v.csv')
      )
      expect(await read.text()).toBe('v2')

      const removed = await answer(
        dispatch(
          '/SASjsApi/drive/file?_filePath=' + encodeURIComponent('/data/v.csv'),
          { method: 'DELETE' }
        )
      )
      expect(removed.body).toEqual({ status: 'success' })

      const gone = await dispatch(
        '/SASjsApi/drive/file?_filePath=' + encodeURIComponent('/data/v.csv')
      )
      expect(gone.status).toBe(404)
    })

    it('refuses an upload with no file, no path, or a blocked extension', async () => {
      const { dispatch } = seeded()

      const empty = new FormData()
      const noFile = await answer(
        dispatch(
          '/SASjsApi/drive/file?_filePath=' + encodeURIComponent('/data/x.csv'),
          { method: 'POST', body: empty }
        )
      )
      expect(noFile.status).toBe(400)
      expect(noFile.body).toEqual('"file" is not present.')

      const form = new FormData()
      form.set('file', new Blob(['x']), 'x.csv')
      const noPath = await answer(
        dispatch('/SASjsApi/drive/file', { method: 'POST', body: form })
      )
      expect(noPath.status).toBe(400)
      expect(noPath.body).toEqual('"_filePath" is required')

      const sh = new FormData()
      sh.set('file', new Blob(['x']), 'run.sh')
      const blocked = await answer(
        dispatch(
          '/SASjsApi/drive/file?_filePath=' +
            encodeURIComponent('/data/run.sh'),
          { method: 'POST', body: sh }
        )
      )
      expect(blocked.status).toBe(400)
      expect(blocked.body).toEqual('Invalid file extension')
    })

    it('refuses a path outside the drive on every write route', async () => {
      const { dispatch } = seeded()
      const form = new FormData()
      form.set('file', new Blob(['x']), 'x.csv')

      const outside = await answer(
        dispatch(
          '/SASjsApi/drive/file?_filePath=' +
            encodeURIComponent('/../escape.csv'),
          { method: 'POST', body: form }
        )
      )
      expect(outside.status).toBe(400)

      const rename = await answer(
        dispatch('/SASjsApi/drive/rename', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ oldPath: '/../x', newPath: '/data/y' })
        })
      )
      expect(rename.status).toBe(400)
    })

    it('creates a folder, lists it, and deletes it with its contents', async () => {
      const { dispatch } = seeded()

      const made = await answer(
        dispatch('/SASjsApi/drive/folder', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ folderPath: '/data/reports' })
        })
      )
      expect(made.body).toEqual({ status: 'success' })

      const form = new FormData()
      form.set('file', new Blob(['a']), 'a.csv')
      await dispatch(
        '/SASjsApi/drive/file?_filePath=' +
          encodeURIComponent('/data/reports/a.csv'),
        { method: 'POST', body: form }
      )

      const listed = await dispatch(
        '/SASjsApi/drive/folder?_folderPath=' + encodeURIComponent('/data')
      )
      expect(await listed.json()).toEqual({
        files: [],
        folders: ['reports']
      })

      const removed = await answer(
        dispatch(
          '/SASjsApi/drive/folder?_folderPath=' +
            encodeURIComponent('/data/reports'),
          { method: 'DELETE' }
        )
      )
      expect(removed.body).toEqual({ status: 'success' })

      const gone = await dispatch(
        '/SASjsApi/drive/file?_filePath=' +
          encodeURIComponent('/data/reports/a.csv')
      )
      expect(gone.status).toBe(404)
    })

    it('refuses a folder delete with no path', async () => {
      const { dispatch } = seeded()

      const removed = await answer(
        dispatch('/SASjsApi/drive/folder', { method: 'DELETE' })
      )

      expect(removed.status).toBe(400)
      expect(removed.body).toEqual('"_folderPath" is required')
    })

    it('refuses a rename into a blocked extension, as the server does', async () => {
      const { dispatch } = seeded()
      const form = new FormData()
      form.set('file', new Blob(['r']), 'r.csv')
      await dispatch(
        '/SASjsApi/drive/file?_filePath=' + encodeURIComponent('/data/old.csv'),
        { method: 'POST', body: form }
      )

      const toBlocked = await answer(
        dispatch('/SASjsApi/drive/rename', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            oldPath: '/data/old.csv',
            newPath: '/data/x.sh'
          })
        })
      )

      // The extension rule is the drive's file-path rule, and a rename is a
      // file operation: sasjs/api (since 0.2.1, sasjs/api#12) applies the rule
      // to a rename whose target is a file, so both hosts refuse the move and
      // no entry can be created that the API itself cannot read back. A folder
      // is not subject to the file-path schema, so renaming a folder to a
      // dotted name stays allowed.
      expect(toBlocked.status).toBe(400)
      expect(toBlocked.body).toBe('Invalid file extension')

      // ...and the file is still readable under its original name, so the
      // refusal left the drive exactly as it found it.
      const read = await answer(
        dispatch(
          '/SASjsApi/drive/file?_filePath=' +
            encodeURIComponent('/data/old.csv')
        )
      )
      expect(read.status).toBe(200)
      expect(read.body).toBe('r')
    })

    it('refuses a file where a folder already holds the path', async () => {
      const { dispatch } = seeded()

      await dispatch('/SASjsApi/drive/folder', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ folderPath: '/data/reports' })
      })

      const form = new FormData()
      form.set('file', new Blob(['r']), 'r.csv')
      const atFolder = await answer(
        dispatch(
          '/SASjsApi/drive/file?_filePath=' +
            encodeURIComponent('/data/reports'),
          { method: 'POST', body: form }
        )
      )

      // the server fails this at the filesystem (EISDIR); naming it as a conflict
      // keeps the drive from holding one path as both a file and a folder
      expect(atFolder.status).toBe(409)
    })

    it('refuses a file under a path that is already a file', async () => {
      const { dispatch } = seeded()
      const form = new FormData()
      form.set('file', new Blob(['a']), 'a.csv')
      await dispatch(
        '/SASjsApi/drive/file?_filePath=' + encodeURIComponent('/data/a.csv'),
        { method: 'POST', body: form }
      )

      const child = new FormData()
      child.set('file', new Blob(['b']), 'b.csv')
      const under = await answer(
        dispatch(
          '/SASjsApi/drive/file?_filePath=' +
            encodeURIComponent('/data/a.csv/child.csv'),
          { method: 'POST', body: child }
        )
      )

      // mkdirp would otherwise turn the file into a folder to hold the child.
      // The server loses this at the filesystem (ENOTDIR) and answers a 500, so
      // this answers a 500 too: the refusal is the point, the status is the
      // server's class, and the message says which path was in the way.
      expect(under.status).toBe(500)
      expect(under.body).toEqual({
        message: 'ENOTDIR: an ancestor of the path is a file: /data/a.csv'
      })

      const stillAFile = await dispatch(
        '/SASjsApi/drive/file?_filePath=' + encodeURIComponent('/data/a.csv')
      )
      expect(await stillAFile.text()).toBe('a')
    })

    it('serves a download with the type its extension implies', async () => {
      const { dispatch } = seeded()
      const form = new FormData()
      form.set('file', new Blob(['id,name\n1,Ann\n']), 'users.csv')
      await dispatch(
        '/SASjsApi/drive/file?_filePath=' +
          encodeURIComponent('/data/users.csv'),
        { method: 'POST', body: form }
      )

      const csv = await dispatch(
        '/SASjsApi/drive/file?_filePath=' +
          encodeURIComponent('/data/users.csv')
      )

      // an upload is stored as bytes, as multer leaves it on the server; the
      // extension is what makes it answer text/csv rather than octet-stream
      expect(csv.headers.get('content-type')).toBe('text/csv')
      expect(await csv.text()).toBe('id,name\n1,Ann\n')

      const sas = new FormData()
      sas.set('file', new Blob(['data _null_; run;']), 'p.sas')
      await dispatch(
        '/SASjsApi/drive/file?_filePath=' + encodeURIComponent('/data/p.sas'),
        { method: 'POST', body: sas }
      )
      const program = await dispatch(
        '/SASjsApi/drive/file?_filePath=' + encodeURIComponent('/data/p.sas')
      )
      expect(program.headers.get('content-type')).toBe('text/plain')
    })

    it('refuses an upload larger than the host allows, before reading it', async () => {
      const { dispatch } = seeded()
      const { runtime } = loadWorker()
      const form = new FormData()
      form.set(
        'file',
        new Blob([new Uint8Array(runtime.MAX_UPLOAD_BYTES + 1)]),
        'big.bin'
      )

      const response = await answer(
        dispatch(
          '/SASjsApi/drive/file?_filePath=' +
            encodeURIComponent('/data/big.bin'),
          { method: 'POST', body: form }
        )
      )

      expect(response.status).toBe(413)
      expect(response.body).toContain('larger than the browser host allows')
    })

    it('renames a file through the route the API documents', async () => {
      const { dispatch } = seeded()
      const form = new FormData()
      form.set('file', new Blob(['r']), 'r.csv')
      await dispatch(
        '/SASjsApi/drive/file?_filePath=' + encodeURIComponent('/data/old.csv'),
        { method: 'POST', body: form }
      )

      const renamed = await answer(
        dispatch('/SASjsApi/drive/rename', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            oldPath: '/data/old.csv',
            newPath: '/data/new.csv'
          })
        })
      )

      expect(renamed.body).toEqual({ status: 'success' })
      const read = await dispatch(
        '/SASjsApi/drive/file?_filePath=' + encodeURIComponent('/data/new.csv')
      )
      expect(await read.text()).toBe('r')
    })
  })

  describe('conformance corpus', () => {
    /**
     * The corpus is what "the same API" means: the cases @sasjs/api runs against
     * its own services, and against a live sasjs/server, run here against this
     * worker's HTTP surface. A case that answers differently is this host
     * drifting from the server - the failure mode the hand-written drive routes
     * used to have - and it is a test rather than a review.
     */
    const httpFor = (testCase: CorpusCase) => {
      const [method, routePath] = testCase.route.split(' ')
      const query = new URLSearchParams()
      for (const [key, value] of Object.entries(testCase.request.query || {})) {
        if (value !== undefined) query.set(key, String(value))
      }
      const suffix = query.toString() ? `?${query}` : ''
      const init: any = { method }

      const file = testCase.request.file
      if (file) {
        const form = new FormData()
        // the Blob types want a view over an ArrayBuffer; a Uint8Array from the
        // corpus is typed over ArrayBufferLike, which a Blob does not accept
        const bytes =
          typeof file.contents === 'string'
            ? new TextEncoder().encode(file.contents)
            : new Uint8Array(file.contents)
        form.set('file', new Blob([bytes as BlobPart]), file.name)
        const formPath = testCase.request.body?.filePath
        if (formPath !== undefined) form.set('filePath', String(formPath))
        init.body = form
      } else if (testCase.request.body) {
        init.body = JSON.stringify(testCase.request.body)
        init.headers = { 'content-type': 'application/json' }
      }
      return { path: routePath + suffix, init }
    }

    /**
     * The case's own files, at the paths the drive stores them under. `load`
     * restores the seed snapshot, which is a map of strings - a byte entry is a
     * snapshot of an upload, so it goes in through the store the way an upload
     * does.
     */
    const seedDrive = async (
      runtime: any,
      testCase: CorpusCase
    ): Promise<void> => {
      const text: Record<string, string> = {}
      for (const [file, contents] of Object.entries(testCase.seed || {})) {
        if (typeof contents === 'string')
          text[`/sasjs/drive/files${file}`] = contents
      }
      await runtime.load(text)
      for (const [file, contents] of Object.entries(testCase.seed || {})) {
        if (typeof contents !== 'string')
          await runtime.driveStore.write(file, contents)
      }
    }

    for (const testCase of DRIVE_CORPUS) {
      it(testCase.id, async () => {
        const worker = loadWorker()
        await seedDrive(worker.runtime, testCase)
        worker.refuseWrites(Boolean(testCase.unwritable))

        const { path: requestPath, init } = httpFor(testCase)
        const response = await worker.dispatch(requestPath, init)

        expect(response.status).toBe(testCase.expect.status)
        if (testCase.expect.error !== undefined) {
          const body = await response.text()
          // the routes that answer an envelope - the two deploy routes - send
          // `{status, message}`; the rest send the message itself as text, which
          // is what the server's `res.status(code).send(err.message)` does
          if (
            (response.headers.get('content-type') || '').includes(
              'application/json'
            )
          )
            expect(JSON.parse(body)).toEqual({
              status: 'failure',
              message: testCase.expect.error
            })
          else expect(body).toBe(testCase.expect.error)
        } else {
          const want = testCase.expect.contents
          if (typeof want === 'string') expect(await response.text()).toBe(want)
          else if (want !== undefined)
            expect(new Uint8Array(await response.arrayBuffer())).toEqual(want)
        }
      })
    }
  })
})
