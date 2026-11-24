import fs from 'fs'
import path from 'path'
import {
  DEFAULT_IDENTITY,
  DEPLOY_CORPUS,
  DRIVE_CORPUS,
  IDENTITY_CORPUS,
  RECORD_CORPUS,
  VIYA_TABLE
} from '@sasjs/api'
import type { CorpusCase, IdentityFixture } from '@sasjs/api'
import os from 'os'
import yazl from 'yazl'
import { getWeboutPrelude } from '@sasjs/utils'
import { buildLintBundle, DRIVE_FORMAT, WEBOUT_SENTINELS } from '../mockSite'

export {}

/**
 * The other half of the parity claim: the service worker is what turns an
 * /SASjsApi/ request into a response, so its framing (webout body, the _debug
 * log shape, the 400 and the 500) is tested against the file the site ships.
 */
const appLoc = '/Public/app/test'
const origin = 'https://mock.example.com'
const languageVersion: string = JSON.parse(
  fs.readFileSync(
    path.resolve(
      path.dirname(require.resolve('@sasjs/sas-language/server/node')),
      '../../../../package.json'
    ),
    'utf8'
  )
).version
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

const loadWorker = (
  base = '',
  options: { prelude?: boolean; skipLint?: boolean } = {}
) => {
  jest.resetModules()
  const handlers: { [type: string]: ((event: any) => any)[] } = {}
  let refusingWrites = false
  const self: any = {
    // the worker's own location names the folder the site is served from
    location: { origin, pathname: `${base}/sw.js` },
    registration: { scope: `${origin}${base}/` },
    addEventListener: (type: string, fn: (event: any) => any) => {
      handlers[type] = handlers[type] || []
      handlers[type].push(fn)
    },
    skipWaiting: () => {},
    // a test can put a client here to observe what the host broadcasts; with
    // none, a message reaches nobody and nothing can be asserted about it
    clients: {
      claim: () => {},
      // A function is honoured as well as an array: the browser builds FRESH
      // `Client` objects on every matchAll(), and only `client.id` survives the
      // call, so a case about picking a second tab has to be able to hand out
      // new objects with the same ids.
      matchAll: async () => {
        const clients = (global as any).__mockHostClients
        const found =
          typeof clients === 'function' ? clients() : (clients ?? [])
        return found.map((client: any) => {
          if (!client.url) client.url = `${origin}${base}/`
          return client
        })
      }
    }
  }
  ;(global as any).self = self
  // what the worker pulled into itself, so a test can assert that a script it
  // does not need at boot is not fetched at boot
  const imported: string[] = []
  // sw.js imports the runtime and the package by URL; the test loads the same
  // files from source, so the worker here answers with the code the site ships.
  ;(global as any).importScripts = (path: string) => {
    imported.push(path)
    if (path.includes('md5')) return
    if (path.includes('api-browser')) return require(apiBrowserBuild())
    if (path.includes('lint-browser')) {
      if (options.skipLint) return
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
    if (target.includes('identity.json')) {
      // the fixture the build shipped: the package's demo fixture unless a test
      // names its own, and `'missing'` for a site built before it existed
      const fixture = (global as any).__sasjsIdentity
      if (fixture === 'missing') return new Response('', { status: 404 })
      return jsonResponse(fixture || DEFAULT_IDENTITY)
    }
    if (target.includes('sas-transcript')) {
      const fixture = (global as any).__sasTranscript
      return fixture ? jsonResponse(fixture) : new Response('', { status: 404 })
    }
    // the webout() block the build writes beside the worker, from the same
    // @sasjs/utils generator sasjs/server uses. Absent unless a test asks for
    // it: a site built before the block existed keeps the `_webout`-only path.
    if (options.prelude && target.includes('webout-prelude'))
      return jsonResponse({
        sentinels: WEBOUT_SENTINELS,
        template: getWeboutPrelude({
          weboutPath: WEBOUT_SENTINELS.weboutPath,
          headersPath: WEBOUT_SENTINELS.headersPath,
          program: WEBOUT_SENTINELS.program,
          debug: WEBOUT_SENTINELS.debug,
          username: WEBOUT_SENTINELS.username,
          userId: WEBOUT_SENTINELS.userId,
          apiServerUrl: WEBOUT_SENTINELS.apiServerUrl
        })
      })
    // a sharded drive, when a test sets one up: the index answers the snapshot
    // URL and each piece answers its own file, so the worker's fetch of a shard
    // is the same request it makes against a static host
    const shards = (global as any).__sasjsShards
    if (shards && target.includes('vfs-snapshot')) {
      const piece = /vfs-snapshot-(\d+)\.json/.exec(target)
      if (piece) {
        const id = Number(piece[1])
        const requested = ((global as any).__sasjsShardFetches =
          (global as any).__sasjsShardFetches || [])
        requested.push(id)
        return jsonResponse({ format: DRIVE_FORMAT, files: shards[id] || {} })
      }
      return jsonResponse(shards.index)
    }
    if (target.includes('mock-config')) {
      // a build that split its capture says so, and the runtime reads the index
      // only when it does - a site built before the split has none to read
      const shards = (global as any).__sasjsShards
      return jsonResponse({
        appLoc,
        ...(shards
          ? { snapshotShards: (shards.index.shards || []).length }
          : {})
      })
    }
    if (target.includes('/host/sas-language/')) {
      const relative = new URL(target).pathname.split('/host/sas-language/')[1]!
      const requested = ((global as any).__languageFetches =
        (global as any).__languageFetches || [])
      requested.push(target)
      if ((global as any).__languageMissing)
        return new Response('', { status: 404 })
      const root = path.resolve(
        path.dirname(require.resolve('@sasjs/sas-language/server/node')),
        '..',
        '..'
      )
      const file = path.join(root, relative.split('/').slice(1).join('/'))
      return new Response(fs.readFileSync(file, 'utf8'), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
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
    imported,
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

/** A zip archive of members - text, or bytes for a base64 member - written the way
 * a deploy upload ships one.
 * The first member is stored rather than deflated, so both methods the reader
 * accepts are exercised by the one case. */
const zipOf = (files: { [name: string]: string | Uint8Array }) =>
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
    delete (global as any).__sasjsIdentity
    delete (global as any).__sasjsShards
    delete (global as any).__sasjsShardFetches
    delete (global as any).__mockHostClients
    delete (global as any).__languageFetches
    delete (global as any).__languageMissing
  })

  const seeded = () => {
    const worker = loadWorker()
    worker.runtime.load({
      [drivePath('services/public/getdata.js')]:
        'console.log("hello"); _webout = "seeded";'
    })
    return worker
  }

  it('enforces bearer identity on XHR uploads bridged to the worker', async () => {
    const worker = seeded()
    const identity = {
      ...DEFAULT_IDENTITY,
      permissions: [
        ...DEFAULT_IDENTITY.permissions,
        {
          uid: 'deny-execution-upload',
          path: '/SASjsApi/stp/execute',
          type: 'Route',
          setting: 'Deny',
          user: 'user-restricted'
        }
      ],
      tokens: [
        {
          username: 'sasjsuser',
          accessToken: 'restricted-token',
          refreshToken: 'restricted-refresh'
        },
        {
          username: 'sasjsadmin',
          accessToken: 'admin-token',
          refreshToken: 'admin-refresh'
        }
      ]
    }
    const boot = worker.message({
      type: 'sasjs-seed',
      identity,
      subject: 'sasjsadmin'
    })
    await boot.pending
    expect(boot.replies[0].error).toBeUndefined()
    await worker.runtime.driveStore.mkdirp(appLoc)
    await worker.runtime.driveStore.write(`${appLoc}/read.txt`, 'readable')
    const hostFetch = (global as any).fetch
    const consoleError = jest.spyOn(console, 'error').mockImplementation()
    class XHR {
      responseType = ''
      readyState = 0
      listeners: { [type: string]: (() => void)[] } = {}
      open(_method: string, _url: string) {
        this.readyState = 1
      }
      setRequestHeader(_name: string, _value: string) {}
      send(_body?: any) {}
      addEventListener(type: string, fn: () => void) {
        ;(this.listeners[type] ||= []).push(fn)
      }
      dispatchEvent(event: any) {
        ;(this.listeners[event.type] || []).forEach((fn) => fn())
      }
    }
    try {
      ;(global as any).window = {
        location: {
          href: 'https://app.example/',
          origin: 'https://app.example'
        }
      }
      ;(global as any).document = { baseURI: 'https://app.example/' }
      ;(global as any).localStorage = { getItem: () => null }
      ;(global as any).XMLHttpRequest = XHR
      ;(global as any).ProgressEvent = class {
        constructor(public type: string) {}
      }
      ;(global as any).fetch = (url: string, init: any) => {
        const parsed = new URL(url, 'https://app.example/')
        return parsed.origin === 'https://app.example' &&
          (parsed.pathname.startsWith('/SASjsApi/') ||
            parsed.pathname.startsWith('/api/'))
          ? worker.dispatch(parsed.pathname + parsed.search, init)
          : hostFetch(url, init)
      }
      require('../assets/intercept.js')
      const read = async (token?: string) => {
        const xhr: any = new XHR()
        const loaded = new Promise((resolve) =>
          xhr.addEventListener('load', resolve)
        )
        xhr.open(
          'GET',
          '/api/drive/file?_filePath=' +
            encodeURIComponent(`${appLoc}/read.txt`)
        )
        if (token) xhr.setRequestHeader('Authorization', 'Bearer ' + token)
        xhr.send()
        await loaded
        return xhr
      }
      const badRead = await read('not-a-token')
      expect(badRead.status).toBe(401)
      expect(badRead.responseText).toBe('Unauthorized')
      expect((await read()).status).toBe(200)

      const upload = async (token?: string) => {
        const xhr: any = new XHR()
        const loaded = new Promise((resolve) =>
          xhr.addEventListener('load', resolve)
        )
        xhr.open('POST', '/SASjsApi/drive/deploy/upload')
        if (token) xhr.setRequestHeader('aUtHoRiZaTiOn', 'Bearer ' + token)
        const form = new FormData()
        form.set('appLoc', appLoc)
        form.set(
          'file',
          new Blob([new Uint8Array(await zipOf({ 'proof.txt': 'granted' }))]),
          'deploy.zip'
        )
        xhr.send(form)
        await loaded
        return xhr
      }
      for (const token of ['not-a-token', 'restricted-token']) {
        const xhr = await upload(token)
        expect(xhr.status).toBe(401)
        expect(xhr.responseText).toBe('Unauthorized')
        expect(
          await worker.runtime.driveStore.exists(`${appLoc}/proof.txt`)
        ).toBe(false)
      }
      const admin = await upload('admin-token')
      expect(admin.status).toBe(200)
      expect(
        await worker.runtime.driveStore.read(`${appLoc}/proof.txt`)
      ).toEqual(new TextEncoder().encode('granted'))

      await worker.runtime.driveStore.write(
        `${appLoc}/services/public/getdata.js`,
        '_webout = "seeded"'
      )
      const execution = async (token: string) => {
        const xhr: any = new XHR()
        const loaded = new Promise((resolve) =>
          xhr.addEventListener('load', resolve)
        )
        xhr.open(
          'POST',
          '/SASjsApi/stp/execute?_program=' +
            encodeURIComponent(`${appLoc}/services/public/getdata`)
        )
        xhr.setRequestHeader('Authorization', 'Bearer ' + token)
        const form = new FormData()
        form.append('file', new Blob(['private']), 'private.csv')
        xhr.send(form)
        await loaded
        return xhr
      }
      const fileRead = jest.spyOn(Blob.prototype, 'arrayBuffer')
      try {
        expect((await execution('restricted-token')).status).toBe(401)
        expect(fileRead).not.toHaveBeenCalled()
        const grantedExecution = await execution('admin-token')
        expect([
          grantedExecution.status,
          grantedExecution.responseText
        ]).toEqual([200, 'seeded'])
        expect(fileRead).toHaveBeenCalled()
      } finally {
        fileRead.mockRestore()
      }
    } finally {
      consoleError.mockRestore()
      delete (global as any).window
      delete (global as any).document
      delete (global as any).localStorage
      delete (global as any).XMLHttpRequest
      delete (global as any).ProgressEvent
    }
  })

  it('advertises the runtime upload limit on the grant response', async () => {
    const worker = loadWorker('/demo', { skipLint: true })
    worker.runtime.MAX_UPLOAD_BYTES = 12345
    const response = await worker.dispatch(
      '/demo/SASjsApi/info/myAuthorizedRoutes'
    )
    expect(response.status).toBe(200)
    expect(response.headers.get('x-sasjs-mock-max-upload-bytes')).toBe('12345')
  })

  it('SAS9 runs an existing JS service under the site base', async () => {
    const worker = loadWorker('/demo', { skipLint: true })
    worker.runtime.load({
      [drivePath('services/public/getdata.js')]: '_webout = "seeded";'
    })
    const response = await worker.dispatch(
      '/demo/SASStoredProcess/do?_program=' +
        encodeURIComponent(`${appLoc}/services/public/getdata`)
    )
    expect(response?.status).toBe(200)
    expect(await response.text()).toBe('seeded')
  })

  it.each(['GET', 'POST'])(
    'SAS9 %s execution obeys the canonical stored-process grant',
    async (method) => {
      const identity = {
        ...DEFAULT_IDENTITY,
        permissions: [
          ...DEFAULT_IDENTITY.permissions,
          {
            uid: 'deny-sas9-execution',
            path: '/SASjsApi/stp/execute',
            type: 'Route',
            setting: 'Deny',
            user: 'user-restricted'
          }
        ]
      }
      const worker = loadWorker('/demo', { skipLint: true })
      const boot = worker.message({
        type: 'sasjs-seed',
        identity,
        subject: 'sasjsuser'
      })
      await boot.pending
      expect(boot.replies[0].error).toBeUndefined()
      worker.runtime.load({
        [drivePath('services/public/security.js')]:
          "fs.writeFileSync('/sasjs/drive/files/executed.txt', 'executed'); _webout = 'executed'"
      })
      const program = encodeURIComponent(`${appLoc}/services/public/security`)
      const requestPath = `/demo/SASStoredProcess/do?_program=${program}`
      const denied = await worker.dispatch(requestPath, { method })
      expect(denied.status).toBe(401)
      expect(await worker.runtime.driveStore.exists('/executed.txt')).toBe(
        false
      )

      await worker.message({ type: 'sasjs-as', username: 'sasjsadmin' }).pending
      const granted = await worker.dispatch(requestPath, { method })
      expect(granted.status).toBe(200)
      expect(await granted.text()).toBe('executed')
      expect(await worker.runtime.driveStore.exists('/executed.txt')).toBe(true)
    }
  )

  it.each([
    ['/SASStoredProcess/do', '/SASjsApi/stp/execute'],
    ['/SASjsApi/stp/execute', '/SASjsApi/stp/execute'],
    ['/api/stp/execute//', '/SASjsApi/stp/execute'],
    ['/api/code/execute//', '/SASjsApi/code/execute']
  ])(
    'rejects denied multipart execution at %s without parsing its body',
    async (endpoint, deniedPath) => {
      const worker = loadWorker('', { skipLint: true })
      const identity = {
        ...DEFAULT_IDENTITY,
        permissions: [
          ...DEFAULT_IDENTITY.permissions,
          {
            uid: 'deny-sas9-body',
            path: deniedPath,
            type: 'Route',
            setting: 'Deny',
            user: 'user-restricted'
          }
        ]
      }
      const boot = worker.message({
        type: 'sasjs-seed',
        identity,
        subject: 'sasjsuser'
      })
      await boot.pending
      expect(boot.replies[0].error).toBeUndefined()
      worker.runtime.load({})
      const form = new FormData()
      form.set('_PROGRAM', `${appLoc}/services/public/getdata`)
      form.set('file', new Blob(['data']), 'data.csv')
      const parse = jest.spyOn(Request.prototype, 'formData')
      try {
        const response = await worker.dispatch(endpoint, {
          method: 'POST',
          body: form
        })
        expect(response.status).toBe(401)
        expect(parse).not.toHaveBeenCalled()
      } finally {
        parse.mockRestore()
      }
    }
  )

  it.each(['text', 'base64'])(
    'rejects oversized %s bridge envelope files on SAS9',
    async (encoding) => {
      const worker = loadWorker('', { skipLint: true })
      worker.runtime.load({
        [drivePath('services/public/echo.js')]: '_webout = "executed";'
      })
      const bytes = worker.runtime.MAX_UPLOAD_BYTES + 1
      const table =
        encoding === 'text'
          ? { csv: 'é'.repeat(Math.ceil(bytes / 2)) }
          : { csv: Buffer.alloc(bytes, 255).toString('base64'), binary: true }
      const response = await worker.dispatch(
        '/SASStoredProcess/do',
        runRequest({
          params: { _PROGRAM: `${appLoc}/services/public/echo` },
          tables: [{ name: 'file', filename: 'file.csv', ...table }]
        })
      )
      expect(response.status).toBe(413)
    }
  )

  it.each([
    { subject: 'sasjsadmin', token: undefined },
    { subject: 'sasjsuser', token: undefined },
    { subject: null, token: undefined },
    { subject: 'sasjsadmin', token: 'invalid' }
  ])(
    'SAS9 grant decisions match the canonical run route for $subject',
    async ({ subject, token }) => {
      const worker = loadWorker('', { skipLint: true })
      const boot = worker.message({ type: 'sasjs-seed', subject })
      await boot.pending
      expect(boot.replies[0].error).toBeUndefined()
      worker.runtime.load({
        [drivePath('services/public/echo.js')]: '_webout = "executed";'
      })
      const program = encodeURIComponent(`${appLoc}/services/public/echo`)
      const init = {
        method: 'POST',
        headers: token ? { authorization: `Bearer ${token}` } : {}
      }
      const canonical = await worker.dispatch(
        `/SASjsApi/stp/execute?_program=${program}`,
        init
      )
      const sas9 = await worker.dispatch(
        `/SASStoredProcess/do?_program=${program}`,
        init
      )
      expect(sas9.status).toBe(canonical.status)
      expect(await sas9.text()).toBe(await canonical.text())
    }
  )

  it('accepts bridge files at the byte limit independently', async () => {
    const worker = loadWorker('', { skipLint: true })
    worker.runtime.load({
      [drivePath('services/public/echo.js')]: '_webout = "executed";'
    })
    const limit = worker.runtime.MAX_UPLOAD_BYTES
    const response = await worker.dispatch(
      '/SASStoredProcess/do?_program=' +
        encodeURIComponent(`${appLoc}/services/public/echo`),
      runRequest({
        params: {},
        tables: [
          { name: 'text', csv: 'é'.repeat(limit / 2) },
          {
            name: 'binary',
            csv: Buffer.alloc(limit, 255).toString('base64'),
            binary: true
          }
        ]
      })
    )
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('executed')
  })

  it('keeps the deploy archive exception for bridge envelopes', async () => {
    const worker = loadWorker('', { skipLint: true })
    worker.runtime.load({})
    const bytes = Buffer.alloc(worker.runtime.MAX_UPLOAD_BYTES + 1, 255)
    const response = await worker.dispatch(
      '/SASjsApi/drive/deploy/upload',
      runRequest({
        params: { appLoc },
        tables: [
          {
            name: 'file',
            filename: 'bad.zip',
            csv: bytes.toString('base64'),
            binary: true
          }
        ]
      })
    )
    // Reached the ZIP parser, rather than the ordinary per-file 413 guard.
    expect(response.status).toBe(400)
    expect(await response.text()).toContain('not a zip file')
  })

  it('does not decode multipart bytes until a service calls FETCH', async () => {
    const worker = loadWorker('', { prelude: true, skipLint: true })
    worker.runtime.load({
      [drivePath('services/public/raw.js')]:
        `_webout = fs.readFileSync(_WEBIN_FILEREF1).toString('hex')`,
      [drivePath('services/public/fetch.js')]:
        `_webout = JSON.stringify(webout('FETCH'))`
    })
    const decode = jest.spyOn(TextDecoder.prototype, 'decode')
    const payload = () => {
      const form = new FormData()
      form.append(
        'upload',
        new Blob([new Uint8Array([255, 0, 128])]),
        'binary.bin'
      )
      return { method: 'POST', body: form }
    }
    const uploadDecodes = () =>
      decode.mock.calls.filter(
        ([input]) =>
          input instanceof Uint8Array &&
          input.length === 3 &&
          input[0] === 255 &&
          input[1] === 0 &&
          input[2] === 128
      ).length
    try {
      const raw = await worker.dispatch(
        '/SASjsApi/stp/execute?_program=' +
          encodeURIComponent(`${appLoc}/services/public/raw`),
        payload()
      )
      expect(await raw.text()).toBe('ff0080')
      expect(uploadDecodes()).toBe(0)
      await worker.dispatch(
        '/SASjsApi/stp/execute?_program=' +
          encodeURIComponent(`${appLoc}/services/public/fetch`),
        payload()
      )
      expect(uploadDecodes()).toBeGreaterThan(0)
    } finally {
      decode.mockRestore()
    }
  })

  it.each(['GET', 'POST'])(
    'SAS9 %s debug response is parsed by the installed adapter with mixed-case query names',
    async (method) => {
      const worker = loadWorker('', { skipLint: true })
      worker.runtime.load({
        [drivePath('services/public/adapterdebug.js')]:
          "console.log('adapter log'); _webout = JSON.stringify({custom: customparam})"
      })
      const response = await worker.dispatch(
        `/SASStoredProcess/do?_PrOgRaM=${appLoc}/services/public/adapterdebug&_DeBuG=131&CuStOmPaRaM=hello`,
        { method }
      )
      expect(response.status).toBe(200)
      const body = await response.text()
      const {
        parseWeboutResponse
      } = require('@sasjs/adapter/utils/parseWeboutResponse')
      expect(JSON.parse(parseWeboutResponse(body))).toEqual({ custom: 'hello' })
      expect(body).toContain('adapter log')
    }
  )

  it('SAS9 reads multipart uploads and frames lowercase debug webout', async () => {
    const worker = loadWorker('', { skipLint: true })
    worker.runtime.load({
      [drivePath('services/public/echo.js')]:
        'console.log("mock log"); _webout = JSON.stringify({name: _WEBIN_NAME1, csv: fs.readFileSync(_WEBIN_FILEREF1, "utf8")});'
    })
    const response = await worker.dispatch(
      '/SASStoredProcess/do?_program=' +
        encodeURIComponent(`${appLoc}/services/public/echo`),
      runRequest({
        params: { _debug: '131' },
        tables: [
          { name: 'people', filename: 'people.csv', csv: 'a:$3.\r\nhey' }
        ]
      })
    )
    expect(response.status).toBe(200)
    const body = await response.text()
    const {
      parseWeboutResponse
    } = require('@sasjs/adapter/utils/parseWeboutResponse')
    expect(JSON.parse(parseWeboutResponse(body))).toEqual({
      name: 'people',
      csv: 'a:$3.\r\nhey'
    })
    expect(body).toContain('mock log')
    expect(body).not.toContain(LOGS_SEPARATOR)
  })

  it.each(['GET', 'POST'])(
    'SAS9 %s frames only numeric debug levels of at least 131',
    async (method) => {
      const worker = loadWorker('', { skipLint: true })
      worker.runtime.load({
        [drivePath('services/public/debuglevel.js')]:
          "console.log('debug log'); _webout = 'webout'"
      })
      for (const [level, framed] of [
        ['0', false],
        ['130', false],
        ['131', true],
        ['log', false]
      ] as const) {
        const response = await worker.dispatch(
          `/SASStoredProcess/do?_program=${appLoc}/services/public/debuglevel&_debug=${level}`,
          { method }
        )
        expect(response.status).toBe(200)
        const body = await response.text()
        expect(body.includes('>>weboutBEGIN<<')).toBe(framed)
        if (framed) {
          expect(body).toContain('debug log')
          expect(body).toContain('>>weboutBEGIN<<webout>>weboutEND<<')
          expect(body).not.toContain(LOGS_SEPARATOR)
        } else expect(body).toBe('webout')
      }
    }
  )

  it.each([
    ['log', true, false],
    ['0x10', true, false],
    ['1e3', true, true],
    ['130', false, false],
    ['131', true, true]
  ])(
    'keeps StoredProgram and SAS9 debug framing distinct for %s',
    async (value, tierFramed, sas9Framed) => {
      const worker = loadWorker('', { skipLint: true })
      worker.runtime.load({
        [drivePath('services/public/debugparity.js')]:
          "console.log('debug log'); _webout = JSON.stringify({ok: true})"
      })
      const {
        parseWeboutResponse
      } = require('@sasjs/adapter/utils/parseWeboutResponse')
      for (const [tier, framed] of [
        ['/StoredProgram', tierFramed],
        ['/SASStoredProcess/do', sas9Framed]
      ] as const) {
        const response = await worker.dispatch(
          `${tier}?_program=${appLoc}/services/public/debugparity&_debug=${value}`
        )
        expect(response.status).toBe(200)
        const body = await response.text()
        const marker =
          tier === '/StoredProgram' ? LOGS_SEPARATOR : '>>weboutBEGIN<<'
        expect(body.includes(marker)).toBe(framed)
        if (tier === '/SASStoredProcess/do' && framed)
          expect(JSON.parse(parseWeboutResponse(body))).toEqual({ ok: true })
        if (!framed) expect(JSON.parse(body)).toEqual({ ok: true })
      }
    }
  )

  it('SAS9 passes raw lowercase debug values into the program', async () => {
    const worker = loadWorker('', { skipLint: true })
    worker.runtime.load({
      [drivePath('services/public/rawdebug.js')]: '_webout = String(_debug)'
    })
    for (const value of ['0', 'log']) {
      const response = await worker.dispatch(
        `/SASStoredProcess/do?_program=${appLoc}/services/public/rawdebug&_debug=${value}`
      )
      expect(response.status).toBe(200)
      expect(await response.text()).toBe(value)
    }
  })

  it('SAS9 preserves body debug casing without enabling uppercase debug', async () => {
    const worker = loadWorker('', { skipLint: true })
    worker.runtime.load({
      [drivePath('services/public/bodydebug.js')]:
        '_webout = JSON.stringify({ lower: typeof _debug === "undefined" ? null : _debug, upper: typeof _DEBUG === "undefined" ? null : _DEBUG })'
    })
    const path = `/SASStoredProcess/do?_program=${appLoc}/services/public/bodydebug`
    const response = await worker.dispatch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ _DEBUG: '131' })
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ lower: null, upper: '131' })
  })

  it('SAS9 keeps query debug distinct from differently cased body fields', async () => {
    const worker = loadWorker('', { skipLint: true })
    worker.runtime.load({
      [drivePath('services/public/debugcollision.js')]:
        '_webout = JSON.stringify({ lower: _debug, upper: _DEBUG })'
    })
    const response = await worker.dispatch(
      `/SASStoredProcess/do?_program=${appLoc}/services/public/debugcollision&_debug=0`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ _DEBUG: '131' })
      }
    )
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ lower: '0', upper: '131' })
  })

  it('SAS9 refuses a SAS-only program instead of inventing a session', async () => {
    const worker = loadWorker('', { skipLint: true })
    worker.runtime.load({
      [drivePath('services/public/report.sas')]: 'data x; run;'
    })
    const response = await worker.dispatch(
      '/SASStoredProcess/do?_program=' +
        encodeURIComponent(`${appLoc}/services/public/report`)
    )
    expect(response.status).toBeGreaterThanOrEqual(400)
    expect(await response.text()).not.toContain('MOCKED')
  })

  it('SAS9 identity probe names the selected demo account and rejects bad credentials', async () => {
    const worker = loadWorker('/demo', { skipLint: true })
    worker.runtime.load({})
    const initial = await worker.dispatch('/demo/SASStoredProcess')
    expect(initial.status).toBe(200)
    const probe = await initial.text()
    expect(probe).toContain('Log Off Demo Admin')
    const { RequestClient } = require('@sasjs/adapter/request/RequestClient')
    const { AuthManager } = require('@sasjs/adapter/auth/AuthManager')
    const client = new RequestClient('')
    const parsed = client.parseResponse({
      data: probe,
      headers: {},
      status: 200
    })
    const { ServerType } = require('@sasjs/utils/types')
    const auth = new AuthManager(
      '',
      ServerType.Sas9,
      { get: async () => parsed },
      () => {}
    )
    expect(await auth.fetchUserName()).toEqual({
      isLoggedIn: true,
      userName: '',
      userLongName: 'Demo Admin'
    })
    await worker.message({ type: 'sasjs-as', username: 'sasjsuser' }).pending
    const selected = await worker.dispatch('/demo/SASStoredProcess')
    expect(await selected.text()).toContain('Log Off Demo User')
    const refused = await worker.dispatch('/demo/SASStoredProcess', {
      headers: { authorization: 'Bearer invalid' }
    })
    expect(refused.status).toBe(401)
  })

  it('SAS9 executes multipart bodies and refuses missing services and invalid credentials', async () => {
    const worker = loadWorker('', { skipLint: true })
    worker.runtime.load({
      [drivePath('services/public/echo.js')]:
        '_webout = _WEBIN_NAME1 + "|" + fs.readFileSync(_WEBIN_FILEREF1, "utf8");'
    })
    const form = new FormData()
    form.set('people', new Blob(['name:$5.\r\nAlice']), 'people.csv')
    const response = await worker.dispatch(
      '/SASStoredProcess/do?_program=' +
        encodeURIComponent(`${appLoc}/services/public/echo`),
      {
        method: 'POST',
        body: form
      }
    )
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('people|name:$5.\r\nAlice')
    const unknown = await worker.dispatch(
      '/SASStoredProcess/do?_program=' + encodeURIComponent(`${appLoc}/missing`)
    )
    expect(unknown.status).toBeGreaterThanOrEqual(400)
    const invalid = await worker.dispatch(
      '/SASStoredProcess/do?_program=' +
        encodeURIComponent(`${appLoc}/services/public/echo`),
      {
        headers: { authorization: 'Bearer invalid' }
      }
    )
    expect(invalid.status).toBe(401)
  })

  it('SAS9 debug preserves separator text inside webout', async () => {
    const worker = loadWorker('', { skipLint: true })
    worker.runtime.load({
      [drivePath('services/public/sep.js')]:
        `_webout = ${JSON.stringify(JSON.stringify({ value: LOGS_SEPARATOR }))};`
    })
    const response = await worker.dispatch(
      '/SASStoredProcess/do?_debug=131&_program=' +
        encodeURIComponent(`${appLoc}/services/public/sep`)
    )
    const body = await response.text()
    const {
      parseWeboutResponse
    } = require('@sasjs/adapter/utils/parseWeboutResponse')
    expect(JSON.parse(parseWeboutResponse(body))).toEqual({
      value: LOGS_SEPARATOR
    })
  })

  it('SAS9 selects the JS twin before the SAS twin', async () => {
    const worker = loadWorker('', { skipLint: true })
    worker.runtime.load({
      [drivePath('services/public/twin.js')]: '_webout = "javascript";',
      [drivePath('services/public/twin.sas')]: 'data x; run;'
    })
    const response = await worker.dispatch(
      '/SASStoredProcess/do?_program=' +
        encodeURIComponent(`${appLoc}/services/public/twin`)
    )
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('javascript')
  })

  it('SAS9 refuses a SAS-only program in a non-boot shard', async () => {
    const program = drivePath('services/public/report.sas')
    ;(global as any).__sasjsShards = {
      index: {
        format: DRIVE_FORMAT,
        sharded: true,
        boot: 0,
        entries: { [program]: { shard: 1, bytes: 12 } },
        shards: [
          { id: 0, file: 'host/vfs-snapshot-0.json' },
          { id: 1, file: 'host/vfs-snapshot-1.json' }
        ]
      },
      0: {},
      1: { [program]: 'data x; run;' }
    }
    const worker = loadWorker('', { skipLint: true })
    const response = await worker.dispatch(
      '/SASStoredProcess/do?_program=' +
        encodeURIComponent(`${appLoc}/services/public/report`)
    )
    expect(response.status).toBe(501)
  })

  it('preserves repeated adapter parameter-table chunks in multipart order', async () => {
    const worker = loadWorker('', { prelude: true, skipLint: true })
    worker.runtime.load({
      [drivePath('services/public/echo.js')]:
        "_webout = JSON.stringify(webout('FETCH'))"
    })
    const data = {
      small: [{ TEXT: 'short' }],
      long: [{ TEXT: 'a'.repeat(15980) + ',"Zoë\r\n' + 'b'.repeat(15000) }],
      last: [{ TEXT: 'end' }]
    }
    const form = new FormData()
    const { requestParams } =
      require('@sasjs/adapter/file/generateTableUploadForm').generateTableUploadForm(
        form,
        data
      )
    for (const [name, value] of Object.entries(requestParams))
      form.append(name, String(value))
    expect(form.getAll('sasjs2data').length).toBeGreaterThan(1)
    const response = await worker.dispatch(
      '/SASjsApi/stp/execute?_program=' +
        encodeURIComponent(`${appLoc}/services/public/echo`),
      { method: 'POST', body: form }
    )
    const text = await response.text()
    expect({ status: response.status, body: text }).toEqual({
      status: 200,
      body: JSON.stringify(data)
    })
  })

  it('leaves repeated non-table form fields as their last value', async () => {
    const worker = loadWorker('', { skipLint: true })
    worker.runtime.load({
      [drivePath('services/public/params.js')]:
        '_webout = JSON.stringify({ ordinary, sasjs1data })'
    })
    const form = new FormData()
    form.append('ordinary', 'first')
    form.append('ordinary', 'second')
    form.append('sasjs1data', 'first')
    form.append('sasjs1data', 'second')
    const response = await worker.dispatch(
      '/SASjsApi/stp/execute?_program=' +
        encodeURIComponent(`${appLoc}/services/public/params`),
      { method: 'POST', body: form }
    )
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      ordinary: 'second',
      sasjs1data: 'second'
    })
  })

  it('recognizes mixed-case table fields without merging distinct caller keys', async () => {
    const worker = loadWorker('', { skipLint: true })
    worker.runtime.load({
      [drivePath('services/public/params.js')]:
        '_webout = JSON.stringify({ SaSjS1DaTa, sasjs1data, Ordinary, SASJS_TABLES })'
    })
    const form = new FormData()
    form.append('SaSjS1DaTa', 'first')
    form.append('sasjs1data', 'lower')
    form.append('SaSjS1DaTa', 'second')
    form.append('Ordinary', 'one')
    form.append('Ordinary', 'two')
    form.append('SASJS_TABLES', 'input')
    const response = await worker.dispatch(
      '/SASjsApi/stp/execute?_program=' +
        encodeURIComponent(`${appLoc}/services/public/params`),
      { method: 'POST', body: form }
    )
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      SaSjS1DaTa: 'firstsecond',
      sasjs1data: 'lower',
      Ordinary: 'two',
      SASJS_TABLES: 'input'
    })
  })

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

  it('runs a JS program written the way sasjs/server runs one', async () => {
    // webout() is OPEN / OBJ / CLOSE on both hosts - @sasjs/utils generates the
    // block, and the CLI ships it to the worker as host/webout-prelude.json -
    // so a program written for the server behaves the same here. That is the
    // shape the demo's own .js program is written in, and the reason a bare
    // webout(rows) is not a thing on either host.
    const worker = loadWorker('', { prelude: true })
    worker.runtime.load({
      [drivePath('services/public/run.js')]: [
        "const rows = [{ name: 'Alice', age: 14 }, { name: 'Bob', age: 15 }]",
        'console.log(`Read ${rows.length} rows`)',
        "webout('OPEN')",
        "webout('OBJ', 'adults', rows.filter((row) => row.age > 13))",
        "webout('CLOSE')"
      ].join('\n')
    })

    const response = await worker.dispatch(
      '/SASjsApi/stp/execute?_program=' +
        encodeURIComponent(`${appLoc}/services/public/run`)
    )

    expect(response.status).toBe(200)

    const body = JSON.parse(await response.text())
    expect(body.adults).toEqual([
      { name: 'Alice', age: 14 },
      { name: 'Bob', age: 15 }
    ])
  })

  it('answers a Run in Studio on the recorded program, as a code run', async () => {
    // Press Run in Studio posts the buffer to /code/execute with the file's own
    // path prepended as `%let _program` - the path is not a query parameter, as
    // it is for stp/execute. The recording is what answers it: without this the
    // demo's .sas program has a Run button (the host states `sas`) and no way to
    // answer it, because a browser cannot compile SAS.
    ;(global as any).__sasTranscript = {
      [`${appLoc}/services/public/program.sas`]: {
        webout: '{"SYSSITE":"00000000"}',
        log: 'NOTE: recorded',
        print: 'The SAS System'
      }
    }

    const worker = loadWorker()
    worker.runtime.load({
      [drivePath('services/public/program.sas')]: 'data work.class; run;'
    })

    const response = await worker.dispatch(
      '/SASjsApi/code/execute',
      runRequest({
        code: `%let _program = ${appLoc}/services/public/program.sas;\ndata work.class; run;`,
        runTime: 'sas'
      })
    )

    expect(response.status).toBe(200)

    // the three parts, framed the way a code run is: a code route always answers
    // with its log, and the Studio splits webout / log / listing on the separator
    const parts = (await response.text()).split(LOGS_SEPARATOR)
    expect(parts[0].trim()).toBe('{"SYSSITE":"00000000"}')
    expect(parts[1]).toContain('NOTE: recorded')
    expect(parts[2]).toContain('The SAS System')

    delete (global as any).__sasTranscript
  })

  it('answers only the line the interface writes, not one further down', async () => {
    // The interface puts `%let _program` first; a line further down belongs to
    // the program. Reading it would hand a caller's own SAS program the session
    // recorded for another file - a different file's log, which is worse than the
    // mocked one.
    ;(global as any).__sasTranscript = {
      [`${appLoc}/services/public/program.sas`]: {
        webout: '{"SYSSITE":"00000000"}',
        log: 'NOTE: recorded',
        print: 'The SAS System'
      }
    }

    const worker = loadWorker()
    worker.runtime.load({
      [drivePath('services/public/mine.sas')]: 'data work.class; run;'
    })

    const response = await worker.dispatch(
      '/SASjsApi/code/execute',
      runRequest({
        code: `data _null_;\n%let _program = ${appLoc}/services/public/program.sas;\nrun;`,
        runTime: 'sas'
      })
    )

    expect(response.status).toBe(200)

    const body = await response.text()
    expect(body).toContain('This is a mocked SAS session')
    expect(body).not.toContain('NOTE: recorded')

    delete (global as any).__sasTranscript
  })

  it('answers a program it never recorded with the mocked session', async () => {
    // A mock is a JavaScript backend: SAS is mocked, and the visitor knows it. So a program
    // the project did not record - one they just created, or one that was never there - is
    // answered with a session rather than refused: the demo exists to show what the Studio
    // does when a program has run.
    const worker = loadWorker()
    worker.runtime.load({
      [drivePath('services/public/other.sas')]: 'data work.class; run;'
    })

    const response = await worker.dispatch(
      '/SASjsApi/stp/execute?_program=' +
        encodeURIComponent(`${appLoc}/services/public/other`) +
        '&_debug=131'
    )

    expect(response.status).toBe(200)

    const body = await response.text()
    expect(body).toContain('This is a mocked SAS session')
    expect(body).toContain('services/public/other')
    expect(body).not.toContain('SAS is not available')
  })

  it('answers an unsaved buffer with the mocked session', async () => {
    // Code typed into a buffer with no file behind it reaches `/code/execute` with no
    // `_program` line to name it, so the session says what was run instead of naming a path.
    const worker = loadWorker()

    const response = await worker.dispatch(
      '/SASjsApi/code/execute',
      runRequest({ code: 'data work.class; run;', runTime: 'sas' })
    )

    expect(response.status).toBe(200)

    const body = await response.text()
    expect(body).toContain('This is a mocked SAS session')
    expect(body).toContain('the code in this buffer')
  })

  it('gives the mocked session the notes, warnings and errors a log panel reads', async () => {
    // The point of answering rather than refusing is what the visitor sees: a Studio log
    // marked up the way a real run marks it. An empty mock log would leave the panel - and the
    // error and warning filters beside it - looking at a run that did nothing.
    const worker = loadWorker()

    const response = await worker.dispatch(
      '/SASjsApi/code/execute',
      runRequest({ code: 'data work.class; run;', runTime: 'sas' })
    )

    const body = await response.text()
    expect(body).toMatch(/^\d+\s+\w/m) // source lines with their numbers
    expect(body).toContain('ERROR 22-322')
    expect(body).toContain('WARNING:')
    expect(body).toContain('NOTE:')
    expect(body).toContain('The SAS System')
  })

  it('fills a program path holding $& literally', async () => {
    // The path is what the answer names, and a string replacement would expand `$&` in it -
    // answering a caller who names `services/$&x` with `{{program}}` in place of their own path.
    const worker = loadWorker()
    worker.runtime.load({
      [drivePath('services/public/$&x.sas')]: 'data work.class; run;'
    })

    const response = await worker.dispatch(
      '/SASjsApi/stp/execute?_program=' +
        encodeURIComponent(`${appLoc}/services/public/$&x`) +
        '&_debug=131'
    )

    expect(response.status).toBe(200)

    const body = await response.text()
    expect(body).toContain('services/public/$&x')
    expect(body).not.toContain('{{program}}')
  })

  it('prefers the recording that names the program over the mocked session', async () => {
    // The project's own output beats ours, which is why it recorded it.
    ;(global as any).__sasTranscript = {
      [`${appLoc}/services/public/report.sas`]: {
        webout: '',
        log: 'NOTE: the recorded session',
        print: ''
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

    const body = await response.text()
    expect(body).toContain('the recorded session')
    expect(body).not.toContain('This is a mocked SAS session')

    delete (global as any).__sasTranscript
  })

  it('runs a JavaScript code run rather than answering it with the recorded session', async () => {
    // The demo's app services are JavaScript. They execute here, so a project that ships a
    // fallback must not have its own code replaced by a recorded SAS session: the run time,
    // not the presence of code, is what makes a run SAS.
    ;(global as any).__sasTranscript = {
      '*': {
        webout: 'RECORDED-SESSION',
        log: 'NOTE: the demo session',
        print: ''
      }
    }

    const { dispatch } = seeded()

    const response = await dispatch(
      '/SASjsApi/code/execute',
      runRequest({ code: '_webout = "inline";', runTime: 'js', params: {} })
    )

    expect(response.status).toBe(200)

    const body = await response.text()
    expect(body.split(LOGS_SEPARATOR)[0].trim()).toBe('inline')
    expect(body).not.toContain('RECORDED-SESSION')

    delete (global as any).__sasTranscript
  })

  it('runs the run time first in RUN_TIMES when a program names no extension', async () => {
    // SASjs Server gives priority to the run time that comes first in `RUN_TIMES`
    // (docs/pages/settings.md): with `js,sas`, `/services/public/twin` is `twin.js`. This host
    // declares that order, so a project shipping both files runs the JavaScript one - and the
    // SAS recording, which answers only a run time this host cannot execute, is not consulted.
    ;(global as any).__sasTranscript = {
      '*': {
        webout: 'RECORDED-SESSION',
        log: 'NOTE: the demo session',
        print: ''
      }
    }

    const worker = seeded()
    worker.runtime.load({
      [drivePath('services/public/twin.js')]: '_webout = "from the js twin";',
      [drivePath('services/public/twin.sas')]: 'data work.class; run;'
    })

    const response = await worker.dispatch(
      '/SASjsApi/stp/execute?_program=' +
        encodeURIComponent(`${appLoc}/services/public/twin`) +
        '&_debug=131'
    )

    expect(response.status).toBe(200)

    const body = await response.text()
    expect(body).toContain('from the js twin')
    expect(body).not.toContain('RECORDED-SESSION')

    delete (global as any).__sasTranscript
  })

  it('runs a JavaScript program rather than answering it with the recorded session', async () => {
    // Same rule on the program path: a program run states no run time, so its extension
    // decides - `service.js` is executed, `report.sas` is not.
    ;(global as any).__sasTranscript = {
      '*': {
        webout: 'RECORDED-SESSION',
        log: 'NOTE: the demo session',
        print: ''
      }
    }

    const worker = seeded()
    worker.runtime.load({
      [drivePath('services/public/service.js')]: '_webout = "from the service";'
    })

    const response = await worker.dispatch(
      '/SASjsApi/stp/execute?_program=' +
        encodeURIComponent(`${appLoc}/services/public/service`) +
        '&_debug=131'
    )

    expect(response.status).toBe(200)

    const body = await response.text()
    expect(body).toContain('from the service')
    expect(body).not.toContain('RECORDED-SESSION')

    delete (global as any).__sasTranscript
  })

  it('answers SAS code that names no recorded program with the mocked session', async () => {
    // A code run from an API client carries no `%let _program` line, so there is no path to
    // look up: the session says the code in the buffer was run. It is still a run, not a
    // refusal, and it is still not handed to the JavaScript runner.
    const worker = loadWorker()

    for (const code of [
      'data work.class; run;',
      `%let _program = ${appLoc}/services/public/other.sas;\ndata work.class; run;`
    ]) {
      const response = await worker.dispatch(
        '/SASjsApi/code/execute',
        runRequest({ code, runTime: 'sas' })
      )

      expect(response.status).toBe(200)

      const body = await response.text()
      expect(body).toContain('This is a mocked SAS session')
      expect(body).not.toContain('SyntaxError')
    }
  })

  it('answers a .sas program no recording names with the mocked session', async () => {
    // The recording is data, not a run time. Without one, a SAS program is answered with the
    // mocked session - and in particular is not compiled as JavaScript, which would answer a
    // SyntaxError quoting the SAS source.
    const worker = loadWorker()
    worker.runtime.load({
      [drivePath('services/public/other.sas')]: 'data work.class; run;'
    })

    const response = await worker.dispatch(
      '/SASjsApi/stp/execute?_program=' +
        encodeURIComponent(`${appLoc}/services/public/other`) +
        '&_debug=131'
    )

    expect(response.status).toBe(200)

    const body = await response.text()
    expect(body).toContain('This is a mocked SAS session')
    expect(body).not.toContain('SAS is not available')
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

    it('imports the fixture directory', async () => {
      const { dispatch } = seeded()

      // every account and group the source names is already present
      const synced = await dispatch(
        '/SASjsApi/authConfig/synchroniseWithLDAP',
        { method: 'POST' }
      )
      expect(synced.status).toBe(200)
      expect(await synced.json()).toEqual({ userCount: 0, groupCount: 0 })
    })

    it('formats DATA and PROC with the real vocabulary under a mounted site', async () => {
      const worker = loadWorker('/demo')
      worker.runtime.load({})
      const formatted = await worker.dispatch(
        '/demo/SASjsApi/code/format',
        runRequest({
          code: 'data foo; x=1; run;\nproc sql; select * from foo; quit;\n'
        })
      )
      expect(formatted.status).toBe(200)
      const text = await formatted.json()
      expect(text).toContain('data foo;\n  x=1;\nrun;')
      expect(text).toContain('proc sql;\n')
      const urls: string[] = (global as any).__languageFetches
      expect(
        urls.every((url) =>
          url.startsWith(`${origin}/demo/host/sas-language/${languageVersion}/`)
        )
      ).toBe(true)
      expect(urls.some((url) => url.includes('/Procedures/en/SQL.json'))).toBe(
        true
      )
    })

    it('reports missing language data instead of silently returning the input', async () => {
      ;(global as any).__languageMissing = true
      const worker = loadWorker('/missing')
      worker.runtime.load({})
      const response = await worker.dispatch(
        '/missing/SASjsApi/code/format',
        runRequest({ code: 'data foo; x=1; run;\n' })
      )
      expect(response.status).toBe(500)
      expect(await response.text()).toContain('SAS language data is missing')
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

    /**
     * The linter is imported with the host, because it has to be.
     *
     * A service worker may only `importScripts` while its own script is being
     * evaluated: a call made from a request handler fails with "The script at ...
     * failed to load", which is what a lazy import gave a real browser - the two
     * code routes answered 500. So the import is at boot, and the assertion is
     * that a code route answers *without* importing anything at request time.
     */
    it('imports the linter at boot and answers a code route without importing', async () => {
      const worker = seeded()

      expect(
        worker.imported.some((path) => path.includes('lint-browser'))
      ).toBe(true)

      const before = worker.imported.length

      const response = await worker.dispatch(
        '/SASjsApi/code/lint',
        runRequest({ code: 'data a;\nrun;\n' })
      )

      expect(response.status).toBe(200)
      expect(worker.imported.length).toBe(before)
    })

    /**
     * A route that resolves a path from the drive is not left with a hole.
     *
     * The rules an edited file is linted against are found by walking up from
     * the file, so the request names neither path. The read that fails says
     * which piece it needs, and the request is answered again with it - the body
     * re-read from the copy taken before the first attempt.
     */
    it('fetches the piece a route resolves from the drive, not the one it names', async () => {
      ;(global as any).__sasjsShards = {
        index: {
          format: DRIVE_FORMAT,
          sharded: true,
          boot: 0,
          entries: {
            '/sasjs/drive/files/.sasjslint': { shard: 1, bytes: 20 },
            '/sasjs/drive/files/Public/app/test/prog.sas': {
              shard: 0,
              bytes: 12
            }
          },
          shards: [
            { id: 0, file: 'host/vfs-snapshot-0.json' },
            { id: 1, file: 'host/vfs-snapshot-1.json' }
          ]
        },
        0: { '/sasjs/drive/files/Public/app/test/prog.sas': 'data a; run;' },
        1: {
          '/sasjs/drive/files/.sasjslint': JSON.stringify({
            maxLineLength: 200
          })
        }
      }
      ;(global as any).__sasjsShardFetches = []

      const worker = loadWorker()
      await worker.runtime.load({})

      const longLine = 'x'.repeat(150)
      const response = await worker.dispatch(
        '/SASjsApi/code/lint',
        runRequest({
          code: `data _null_;\n${longLine}\nrun;\n`,
          filePath: '/Public/app/test/prog.sas'
        })
      )

      expect(response.status).toBe(200)
      // the line is over the linter's default 80 and under this drive's 200, so
      // the answer proves the rules file was read - from a piece the request
      // never named
      expect(JSON.stringify(await response.json())).not.toContain(
        'Line exceeds'
      )
      expect((global as any).__sasjsShardFetches).toEqual([0, 1])
    })

    /**
     * A request that needs a second piece is answered, body and all.
     *
     * The first retry fetches the piece the failed read named; a request that
     * reads two pieces one after another reaches the second retry, which fetches
     * the rest. Either way the body has to arrive again - a Request's body can
     * only be read once, so the first attempt keeps an unread copy and each
     * attempt after it is made from a copy of that.
     */
    it('replays a request that needs two pieces, with its body intact', async () => {
      const near = '/sasjs/drive/files/Public/app/test/.sasjslint'
      const far = '/sasjs/drive/files/.sasjslint'
      ;(global as any).__sasjsShards = {
        index: {
          format: DRIVE_FORMAT,
          sharded: true,
          boot: 0,
          entries: {
            [near]: { shard: 1, bytes: 20 },
            [far]: { shard: 2, bytes: 20 }
          },
          shards: [
            { id: 0, file: 'host/vfs-snapshot-0.json' },
            { id: 1, file: 'host/vfs-snapshot-1.json' },
            { id: 2, file: 'host/vfs-snapshot-2.json' }
          ]
        },
        0: {},
        // the nearest rules file is unreadable as a config, so the walk goes on
        // to the drive root's - a second piece, in a second shard
        1: { [near]: 'not json' },
        2: { [far]: JSON.stringify({ maxLineLength: 200 }) }
      }
      ;(global as any).__sasjsShardFetches = []

      const worker = loadWorker()
      await worker.runtime.load({})

      const longLine = 'x'.repeat(150)
      const response = await worker.dispatch(
        '/SASjsApi/code/lint',
        runRequest({
          code: `data _null_;\n${longLine}\nrun;\n`,
          filePath: '/Public/app/test/prog.sas'
        })
      )

      expect(response.status).toBe(200)
      const findings = JSON.stringify(await response.json())
      // the code arrived on the second attempt and the root rules applied: both
      // halves of the claim
      expect(findings).toContain('Doxygen')
      expect(findings).not.toContain('Line exceeds')
      expect((global as any).__sasjsShardFetches).toEqual([0, 1, 2])
    })

    /**
     * The rules are the drive's, not the linter's defaults.
     *
     * The Studio shows a visitor the drive's `.sasjslint` and invites them to
     * edit it, so a rules file nothing read would be a displayed lie. Each case
     * below changes a rule and reads the answer back through the route the
     * editor calls, because "the resolver was passed" is not the claim - "the
     * squiggle went away" is.
     */
    describe('the drive’s .sasjslint', () => {
      const rootConfig = '/sasjs/drive/files/.sasjslint'
      /** 81 characters: over the default 80, under the 100 these cases set. */
      const longLine = 'x'.repeat(81)
      const code = `data _null_;\n${longLine}\nrun;\n`
      const tooLong = (diagnostics: any[]) =>
        diagnostics.filter((diagnostic) =>
          String(diagnostic.message).startsWith('Line exceeds maximum length')
        )

      const lint = async (worker: any, body: any) => {
        const response = await worker.dispatch(
          '/SASjsApi/code/lint',
          runRequest(body)
        )
        expect(response.status).toBe(200)
        return response.json()
      }

      it('lints against the rules file at the drive root', async () => {
        const worker = seeded()
        await worker.runtime.load({
          [rootConfig]: JSON.stringify({ maxLineLength: 100 }),
          [drivePath('program.sas')]: code
        })

        expect(
          tooLong(
            await lint(worker, { code, filePath: appLoc + '/program.sas' })
          )
        ).toHaveLength(0)

        // the same buffer with the default 80 in place: the finding the rule
        // exists to report
        await worker.runtime.load({
          [rootConfig]: JSON.stringify({ maxLineLength: 80 }),
          [drivePath('program.sas')]: code
        })

        expect(
          tooLong(
            await lint(worker, { code, filePath: appLoc + '/program.sas' })
          )
        ).toHaveLength(1)
      })

      it('re-reads the rules per request, so an edit takes effect', async () => {
        const worker = seeded()
        const path = appLoc + '/program.sas'
        await worker.runtime.load({
          [rootConfig]: JSON.stringify({ maxLineLength: 80 }),
          [drivePath('program.sas')]: code
        })

        expect(
          tooLong(await lint(worker, { code, filePath: path }))
        ).toHaveLength(1)

        // the visitor edits the file on the drive, then lints again: answers
        // cached at boot would keep reporting a rule that no longer applies
        const form = new FormData()
        form.set(
          'file',
          new Blob([JSON.stringify({ maxLineLength: 100 })], {
            type: 'application/json'
          }),
          '.sasjslint'
        )
        const patched = await worker.dispatch(
          `/SASjsApi/drive/file?_filePath=${encodeURIComponent('/.sasjslint')}`,
          { method: 'PATCH', body: form }
        )
        expect(patched.status).toBe(200)

        expect(
          tooLong(await lint(worker, { code, filePath: path }))
        ).toHaveLength(0)
      })

      it('gives a folder its own rules for everything beneath it', async () => {
        const worker = seeded()
        await worker.runtime.load({
          [rootConfig]: JSON.stringify({ maxLineLength: 80 }),
          // the nearer file relaxes the rule for this folder alone
          [`/sasjs/drive/files${appLoc}/.sasjslint`]: JSON.stringify({
            maxLineLength: 200
          })
        })

        expect(
          tooLong(
            await lint(worker, {
              code,
              filePath: `${appLoc}/services/public/program.sas`
            })
          )
        ).toHaveLength(0)

        // outside that folder the root file still applies
        expect(
          tooLong(
            await lint(worker, {
              code,
              filePath: '/home/sasjsadmin/program.sas'
            })
          )
        ).toHaveLength(1)
      })

      it('finds the rules for a path spelled the way a Windows client sends it', async () => {
        const worker = seeded()
        await worker.runtime.load({
          [`/sasjs/drive/files${appLoc}/.sasjslint`]: JSON.stringify({
            maxLineLength: 100
          })
        })

        expect(
          tooLong(
            await lint(worker, {
              code,
              filePath: `${appLoc}\\services\\public\\program.sas`
            })
          )
        ).toHaveLength(0)
      })

      it('skips a rules file that does not parse and uses the one above', async () => {
        const worker = seeded()
        await worker.runtime.load({
          [rootConfig]: JSON.stringify({ maxLineLength: 100 }),
          [`/sasjs/drive/files${appLoc}/.sasjslint`]: '{ this is not json'
        })

        // a broken near file must not break linting, and must not silently
        // replace the rules that were working
        expect(
          tooLong(
            await lint(worker, {
              code,
              filePath: `${appLoc}/services/public/program.sas`
            })
          )
        ).toHaveLength(0)
      })

      it('takes the drive root rules for a buffer with no file, and for a path that escapes the drive', async () => {
        // Neither has a folder to walk from, and a server answers both with the
        // root file rather than with the linter's defaults - so the root file is
        // seeded to a rule the defaults do not share, and no finding means it
        // was read
        const worker = seeded()
        await worker.runtime.load({
          [rootConfig]: JSON.stringify({ maxLineLength: 100 })
        })

        expect(tooLong(await lint(worker, { code }))).toHaveLength(0)
        expect(
          tooLong(
            await lint(worker, {
              code,
              filePath: '../../outside/program.sas'
            })
          )
        ).toHaveLength(0)
      })

      it('falls back to the linter defaults when the drive has no rules file', async () => {
        const worker = seeded()
        await worker.runtime.load({ [drivePath('program.sas')]: code })

        expect(
          tooLong(
            await lint(worker, {
              code,
              filePath: `${appLoc}/program.sas`
            })
          )
        ).toHaveLength(1)
      })

      it('formats with the rules file too', async () => {
        const worker = seeded()
        await worker.runtime.load({
          [rootConfig]: JSON.stringify({
            hasDoxygenHeader: true,
            defaultHeader: '/**\n  @brief the drive header\n**/'
          })
        })

        const formatted = await worker.dispatch(
          '/SASjsApi/code/format',
          runRequest({ code, filePath: '/home/sasjsadmin/program.sas' })
        )

        expect(formatted.status).toBe(200)
        expect(await formatted.text()).toContain('@brief the drive header')
      })
    })

    it('lists only the apps the caller holds a grant on', async () => {
      // a fixture that denies the restricted account one app, by the label an
      // older rule names for it
      ;(global as any).__sasjsIdentity = {
        ...DEFAULT_IDENTITY,
        users: [
          ...DEFAULT_IDENTITY.users,
          {
            uid: 'user-apps',
            username: 'appuser',
            displayName: 'App User',
            password: 'Orion123',
            isAdmin: false,
            isActive: true,
            needsToUpdatePassword: false
          }
        ],
        groups: [
          ...DEFAULT_IDENTITY.groups,
          {
            uid: 'group-apps',
            name: 'AppGroup',
            description: 'Holds grants on particular apps',
            isActive: true,
            users: ['appuser']
          }
        ],
        permissions: [
          ...DEFAULT_IDENTITY.permissions,
          {
            uid: 'rule-app-orders',
            path: '/AppStream/orders',
            type: 'Route',
            setting: 'Deny',
            group: 'group-data-controller'
          },
          // the same app, granted by a rule rather than left to the stream's
          // prefix: a filter that never built its rules from the records, or
          // that misread a group rule, would answer "no apps" for both accounts
          {
            uid: 'rule-app-orders-grant',
            path: '/AppStream/orders',
            type: 'Route',
            setting: 'Grant',
            group: 'group-apps'
          }
        ]
      }

      const worker = loadWorker()

      const archive = await zipOf({
        'services/web/index.html': '<h1>Orders</h1>'
      })
      const form = new FormData()
      form.set('appLoc', '/Public/apps/orders')
      form.set('streamWebFolder', 'web')
      form.set('file', new Blob([new Uint8Array(archive)]), 'deploy.zip')

      const published = await worker.dispatch('/SASjsApi/drive/deploy/upload', {
        method: 'POST',
        body: form
      })
      expect(published.status).toBe(200)
      const app = (await published.json()).app

      // the administrator holds every app, so the listing is untouched for it
      const asAdmin = await worker.dispatch('/app/apps.json')
      expect((await asAdmin.json()).apps.map((row: any) => row.url)).toEqual([
        app.url
      ])

      await worker.message({ type: 'sasjs-as', username: 'sasjsuser' }).pending

      // the rule the fixture states hides the app from the listing
      const asRestricted = await worker.dispatch('/app/apps.json')
      expect((await asRestricted.json()).apps).toEqual([])

      // and the app's own URL is refused, rather than served to a caller the
      // listing does not offer it to
      const appUrl = app.url.replace(/^\/app/, '')
      const page = await worker.dispatch(`/app${appUrl}`)
      expect(page.status).toBe(404)

      // an account the same rule grants the app sees it, which is the case a
      // filter that answered "no apps" for everyone but the administrator would
      // also pass without
      await worker.message({ type: 'sasjs-as', username: 'appuser' }).pending

      const asGranted = await worker.dispatch('/app/apps.json')
      expect((await asGranted.json()).apps.map((row: any) => row.url)).toEqual([
        app.url
      ])
      expect((await worker.dispatch(`/app${appUrl}`)).status).toBe(200)
    })

    it('keeps an app’s URL and tiles inside the folder the site is served from', async () => {
      const worker = loadWorker('/demo')

      const archive = await zipOf({
        'services/web/index.html': '<h1>Deployed</h1>'
      })
      const form = new FormData()
      form.set('appLoc', '/Public/apps/demo')
      form.set('streamWebFolder', 'web')
      form.set('file', new Blob([new Uint8Array(archive)]), 'deploy.zip')
      const published = await worker.dispatch(
        '/demo/SASjsApi/drive/deploy/upload',
        { method: 'POST', body: form }
      )

      expect(published.status).toBe(200)
      const app = (await published.json()).app

      // The package builds an app's URL - and the landing page's links - from the
      // base it was mounted on. Mounted at `/app` on a site served from `/demo`,
      // every one of them would point at the site root and 404, so this asserts
      // the mount and the requests carry the same folder.
      expect(app.url).toBe(`/demo/app/${app.id}/`)

      const listing = await worker.dispatch('/demo/app/apps.json')
      const apps = (await listing.json()).apps
      expect(apps.map((entry: any) => entry.url)).toEqual([
        `/demo/app/${app.id}/`
      ])

      const landing = await worker.dispatch('/demo/app/')
      expect(await landing.text()).toContain(`href="/demo/app/${app.id}/"`)

      // and the URL it stated is the one that serves the app
      const page = await worker.dispatch(`/demo/app/${app.id}/`)
      expect(page.status).toBe(200)
      expect(await page.text()).toContain('<h1>Deployed</h1>')
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

    it('preserves uploaded bytes in a triggered session output', async () => {
      const worker = loadWorker('', { skipLint: true })
      worker.runtime.load({
        [drivePath('services/public/upload.js')]:
          `_webout = _WEBIN_NAME1 + '|' + _WEBIN_FILENAME1 + '|' + fs.readFileSync(_WEBIN_FILEREF1).toString('hex')`
      })
      const program = encodeURIComponent(`${appLoc}/services/public/upload`)
      const triggered = await worker.dispatch(
        '/SASjsApi/stp/trigger?_program=' + program,
        runRequest({
          params: {},
          tables: [
            { name: 'binary', filename: 'raw.bin', csv: 'AP+A', binary: true }
          ]
        })
      )
      expect(triggered.status).toBe(200)
      const { sessionId } = await triggered.json()
      const output = await worker.dispatch(
        `/SASjsApi/session/${sessionId}/output`
      )
      expect(output.status).toBe(200)
      expect(await output.text()).toBe('binary|raw.bin|00ff80')
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

    it('answers a trigger of a SAS program with a session, not a refusal', async () => {
      // A trigger reaches the runtime rather than the run route, so it is answered there - and
      // still as the session record a client parses as JSON, never the framed run. Returning the
      // framed webout would break triggerProgram and the Studio.
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

      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toContain('application/json')

      const body = await response.json()
      expect(body).not.toHaveProperty('webout')
      expect(body.sessionId).toBeTruthy()

      const state = await worker.dispatch(
        `/SASjsApi/session/${body.sessionId}/state`
      )
      expect(await state.json()).toEqual({ state: 'completed' })

      const output = await worker.dispatch(
        `/SASjsApi/session/${body.sessionId}/output`
      )
      expect(await output.text()).toContain('SYSSITE')

      delete (global as any).__sasTranscript
    })

    it('answers a triggered SAS program the project never recorded', async () => {
      // The same rule as a run: a mock does not refuse a SAS session for want of a binary,
      // whichever route asked for it.
      const worker = loadWorker()
      worker.runtime.load({
        [drivePath('services/public/other.sas')]: 'data work.class; run;'
      })

      const response = await worker.dispatch(
        '/SASjsApi/stp/trigger?_program=' +
          encodeURIComponent(`${appLoc}/services/public/other`),
        runRequest({ params: {} })
      )

      expect(response.status).toBe(200)

      const { sessionId } = await response.json()
      expect(sessionId).toBeTruthy()

      const output = await worker.dispatch(
        `/SASjsApi/session/${sessionId}/output`
      )
      expect(output.status).toBe(200)
      expect(await output.text()).toContain('SYSSITE')
    })

    it('refuses an unauthorized upload before reading its body', async () => {
      const worker = seeded()
      await worker.message({ type: 'sasjs-as', username: 'sasjsuser' }).pending
      const form = new FormData()
      form.set('file', new Blob(['not a zip']), 'bad.zip')
      const read = jest.spyOn(Request.prototype, 'formData')
      try {
        const response = await worker.dispatch(
          '/SASjsApi/drive/deploy/upload',
          {
            method: 'POST',
            body: form
          }
        )
        expect(response.status).toBe(401)
        expect(response.headers.get('content-type')).toContain('text/plain')
        expect(await response.text()).toBe('Unauthorized')
        expect(read).not.toHaveBeenCalled()
      } finally {
        read.mockRestore()
      }
    })

    it.each([
      {
        name: 'exact user upload grant',
        path: '/SASjsApi/drive/deploy/upload',
        kind: 'user',
        subject: 'sasjsuser',
        status: 200
      },
      {
        name: 'top-level user grant',
        path: '/SASjsApi',
        kind: 'user',
        subject: 'sasjsuser',
        status: 200
      },
      {
        name: 'deploy parent grant is not an upload grant',
        path: '/SASjsApi/drive/deploy',
        kind: 'user',
        subject: 'sasjsuser',
        status: 401
      },
      {
        name: 'anonymous exact public upload grant',
        path: '/SASjsApi/drive/deploy/upload',
        kind: 'public',
        subject: null,
        status: 200
      },
      {
        name: 'anonymous public parent grant',
        path: '/SASjsApi',
        kind: 'public',
        subject: null,
        status: 401
      }
    ])(
      'checks upload authorization: $name',
      async ({ path, kind, subject, status }) => {
        const worker = loadWorker()
        const identity = {
          ...DEFAULT_IDENTITY,
          groups: [
            ...DEFAULT_IDENTITY.groups,
            {
              uid: 'public-group',
              name: 'public',
              description: '',
              isActive: true,
              users: []
            }
          ],
          permissions: [
            ...DEFAULT_IDENTITY.permissions,
            {
              uid: 'upload-test-rule',
              path,
              type: 'Route',
              setting: 'Grant',
              ...(kind === 'public'
                ? { group: 'public-group' }
                : { user: 'user-restricted' })
            }
          ]
        }
        const boot = worker.message({ type: 'sasjs-seed', identity, subject })
        await boot.pending
        expect(boot.replies[0].error).toBeUndefined()
        const form = new FormData()
        form.set('appLoc', appLoc)
        form.set(
          'file',
          new Blob([new Uint8Array(await zipOf({ 'proof.txt': 'granted' }))]),
          'deploy.zip'
        )
        const read = jest.spyOn(Request.prototype, 'formData')
        try {
          const response = await worker.dispatch(
            '/SASjsApi/drive/deploy/upload',
            { method: 'POST', body: form }
          )
          expect(response.status).toBe(status)
          if (status === 401) {
            expect(await response.text()).toBe('Unauthorized')
            expect(read).not.toHaveBeenCalled()
          } else {
            expect(read).toHaveBeenCalled()
            expect(
              await worker.runtime.driveStore.read(`${appLoc}/proof.txt`)
            ).toEqual(new TextEncoder().encode('granted'))
          }
        } finally {
          read.mockRestore()
        }
      }
    )

    it('refuses a deploy upload with no archive, and one that is not a zip', async () => {
      const { dispatch } = seeded()

      const empty = await dispatch('/SASjsApi/drive/deploy/upload', {
        method: 'POST',
        body: new FormData()
      })
      expect(empty.status).toBe(400)
      // the deploy routes answer a refusal as the envelope the document states for
      // them, which is what the corpus pins for the same route
      expect(await empty.json()).toEqual({
        status: 'failure',
        message: '"file" is not present.'
      })

      const form = new FormData()
      form.set('file', new Blob([new Uint8Array([1, 2, 3])]), 'not-a-zip.zip')
      const notZip = await dispatch('/SASjsApi/drive/deploy/upload', {
        method: 'POST',
        body: form
      })
      expect(notZip.status).toBe(400)
      expect(await notZip.json()).toEqual({
        status: 'failure',
        message: 'The archive is not a zip file.'
      })
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
          '_webout = _WEBIN_NAME1 + "|" + fs.readFileSync(_WEBIN_FILEREF1, "utf8");'
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

  /**
   * A sharded drive supplies the piece a request names, and only that one.
   *
   * The build splits a captured drive so the first page does not download every
   * app's bundle. That makes it the host's job to fetch the piece holding the
   * path a route reads - here a drive file, named in `_filePath` - and to leave
   * the pieces nobody asked for on the site.
   */
  it('fetches the piece a drive request names, and leaves the rest', async () => {
    // the index names absolute paths; the route is given one relative to the
    // drive, which is the form an adapter sends
    const small = '/sasjs/drive/files/config.json'
    const large = '/sasjs/drive/files/data/large.csv'
    ;(global as any).__sasjsShards = {
      index: {
        format: DRIVE_FORMAT,
        sharded: true,
        boot: 0,
        entries: {
          [small]: { shard: 0, bytes: 2 },
          [large]: { shard: 1, bytes: 64 }
        },
        shards: [
          { id: 0, file: 'host/vfs-snapshot-0.json' },
          { id: 1, file: 'host/vfs-snapshot-1.json' }
        ]
      },
      0: { [small]: '{}' },
      1: { [large]: 'a,b\n1,2\n3,4\n' }
    }
    ;(global as any).__sasjsShardFetches = []

    const worker = loadWorker()
    await worker.runtime.load({})

    // the boot shard arrived with the drive; the second piece did not
    expect((global as any).__sasjsShardFetches).toEqual([0])

    const response = await worker.dispatch(
      '/SASjsApi/drive/file?_filePath=' + encodeURIComponent('/data/large.csv')
    )

    expect(response.status).toBe(200)
    expect(await response.text()).toContain('a,b')
    expect((global as any).__sasjsShardFetches).toEqual([0, 1])

    // a second read of the same piece is answered from memory
    await worker.dispatch(
      '/SASjsApi/drive/file?_filePath=' + encodeURIComponent('/data/large.csv')
    )
    expect((global as any).__sasjsShardFetches).toEqual([0, 1])
  })

  /**
   * An export is the whole drive, not the part in memory.
   *
   * `window.SASjsMock.download()` writes the file a project ships as
   * `mock-snapshot.json`, so a sharded drive must be fetched before it is
   * dumped - otherwise the next build ships a snapshot that has quietly lost
   * every app the visitor never opened.
   */
  it('exports every piece of a sharded drive, not only the loaded ones', async () => {
    const small = '/sasjs/drive/files/config.json'
    const large = '/sasjs/drive/files/data/large.csv'
    ;(global as any).__sasjsShards = {
      index: {
        format: DRIVE_FORMAT,
        sharded: true,
        boot: 0,
        entries: {
          [small]: { shard: 0, bytes: 2 },
          [large]: { shard: 1, bytes: 8 }
        },
        shards: [
          { id: 0, file: 'host/vfs-snapshot-0.json' },
          { id: 1, file: 'host/vfs-snapshot-1.json' }
        ]
      },
      0: { [small]: '{}' },
      1: { [large]: 'a,b\n1,2\n' }
    }
    ;(global as any).__sasjsShardFetches = []

    const worker = loadWorker()
    await worker.runtime.load({})

    const { replies, pending } = worker.message({ type: 'sasjs-snapshot' })
    await pending

    // the piece nobody read was fetched for the export
    expect((global as any).__sasjsShardFetches).toEqual([0, 1])
    const exported = replies.find((reply) => reply.type === 'sasjs-snapshot')
    expect(Object.keys(exported.files).sort()).toEqual([large, small].sort())
  })

  /**
   * The console's own files are the page, not an API call.
   *
   * `/api/...` is the API's short spelling, so the worker answers it - except for
   * `/api` itself, which a site's own application may answer.
   */
  it('leaves /api to the site, and answers the short spelling below it', async () => {
    const worker = seeded()

    // a site's own application can answer /api (the server interface does), so the
    // worker hands it on; `/api/<something>` is an API call on the short spelling
    expect(worker.dispatch('/api')).toBeUndefined()
    expect(worker.dispatch('/api/')).toBeUndefined()

    // the console has a folder of its own, which is not an API prefix: the static
    // host serves it and the worker never sees it
    expect(worker.dispatch('/api-console/console.js')).toBeUndefined()
    expect(worker.dispatch('/api-console/operations.json')).toBeUndefined()

    // the short spelling of a real operation is still the worker's
    const response = await worker.dispatch('/api/user')
    expect(response.status).toBe(200)
  })

  it('answers 404 for a drive file the drive does not hold', async () => {
    const { dispatch } = seeded()

    const response = await dispatch(
      '/SASjsApi/drive/file?_filePath=' + encodeURIComponent('/missing.txt')
    )

    expect(response.status).toBe(404)
    expect(await response.text()).toBe(`File doesn't exist.`)
  })

  it('publishes, lists, serves and removes an app through the package surface', async () => {
    const { dispatch } = seeded()

    // The listing is the server's web route rather than the API's, and an
    // interface asks for it on every visit: unanswered, the request reaches the
    // static host and the page parses index.html as JSON. Nothing is published
    // here until a deploy publishes something - the folder the site itself was
    // built for is this site's static build, not a deployment in the drive.
    for (const path of ['/app/apps.json', '/AppStream/apps.json']) {
      const listing = await dispatch(path)
      expect(listing.status).toBe(200)
      expect(await listing.json()).toEqual({ apps: [] })
    }

    // `/app` is the default spelling and the canonical root redirects to it,
    // exactly as sasjs/server redirects it.
    for (const path of ['/app', '/app/', '/app/index.html']) {
      const landing = await dispatch(path)
      expect(landing.status).toBe(200)
      expect(landing.headers.get('content-type')).toContain('text/html')
    }

    const root = await dispatch('/AppStream')
    expect(root.status).toBe(301)
    expect(root.headers.get('location')).toBe('/app')

    // a deploy that names the folder it serves the app from publishes one
    const archive = await zipOf({
      'services/web/index.html': '<h1>Demo</h1>'
    })
    const form = new FormData()
    form.set('appLoc', '/Public/apps/demo')
    form.set('streamWebFolder', 'web')
    form.set('file', new Blob([new Uint8Array(archive)]), 'deploy.zip')
    const published = await dispatch('/SASjsApi/drive/deploy/upload', {
      method: 'POST',
      body: form
    })

    expect(published.status).toBe(200)
    const app = (await published.json()).app
    expect(app.name).toBe('demo')
    expect(app.url).toBe(`/app/${app.id}/`)

    // it is listed, at both spellings, and its tile points at the surface
    for (const path of ['/app/apps.json', '/AppStream/apps.json']) {
      const listing = await dispatch(path)
      expect((await listing.json()).apps[0]).toMatchObject({
        id: app.id,
        name: 'demo',
        url: `/app/${app.id}/`
      })
    }

    // and it is served, from the same surface a server serves it from
    for (const path of [
      `/app/${app.id}/`,
      `/app/${app.id}/index.html`,
      `/AppStream/${app.id}/`
    ]) {
      const page = await dispatch(path)
      expect(page.status).toBe(200)
      expect(await page.text()).toContain('<h1>Demo</h1>')
    }

    // a folder URL without its slash redirects into it - the package states the
    // location, already inside the site's folder, and the answer carries no body
    const folder = await dispatch(`/app/${app.id}`)
    expect(folder.status).toBe(301)
    expect(folder.headers.get('location')).toBe(`/app/${app.id}/`)
    expect(await folder.text()).toBe('')

    // a method the surface does not take is refused with the methods it does
    const refused = await dispatch('/app/apps.json', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}'
    })
    expect(refused.status).toBe(405)
    expect(refused.headers.get('allow')).toBe('GET')

    // an id nothing published is the documented 404
    const missing = await dispatch('/app/00000000-0000-4000-8000-000000000000/')
    expect(missing.status).toBe(404)

    // removing it is the deploy route's, by id, and empties the listing
    const removed = await dispatch('/SASjsApi/drive/deploy', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: app.id })
    })
    expect(removed.status).toBe(200)
    expect((await removed.json()).app.id).toBe(app.id)

    const after = await dispatch('/app/apps.json')
    expect(await after.json()).toEqual({ apps: [] })

    const gone = await dispatch(`/app/${app.id}/`)
    expect(gone.status).toBe(404)
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
        '_webout = _WEBIN_NAME1 + "|" + fs.readFileSync(_WEBIN_FILEREF1, "utf8");'
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
    // the documented body, field for field: a property the document does not
    // state, or a login form told there are accounts when there are none, is
    // this host describing an API the server does not serve. `runTimes` is the
    // host's own, not the package's browser fixture: `sas` is what makes the
    // Studio offer Run on a .sas file, and the recording is how it is answered.
    expect(await info.json()).toEqual({
      mode: 'desktop',
      cors: 'disable',
      httpPort: null,
      httpsPort: null,
      runTimes: ['js', 'sas'],
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
    // the reply waits for the drive to be whole, so a sharded site's export is
    // not the part of it that happens to be in memory
    await snapshot.pending
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

  /**
   * The browser terminates a service worker between requests, and the next
   * request starts a new one with an empty drive. The page is what holds the
   * drive, so the worker asks it before the grace in `ensureReady` turns into a
   * seed - a seed over a visitor's drive is their own files reading "File
   * doesn't exist." and a re-create of a shipped path reading "File already
   * exists."
   */
  describe('a worker that starts with no drive', () => {
    const settleUntil = async (check: () => boolean, timeout = 4000) => {
      const started = Date.now()
      while (Date.now() - started < timeout) {
        if (check()) return
        await new Promise((resolve) => setTimeout(resolve, 10))
      }
    }

    it('does not ask a sibling mount for its drive', async () => {
      const foreign = {
        url: origin + '/sasjs/minimal/',
        postMessage: jest.fn()
      }
      const own = { url: origin + '/sas9/minimal/', postMessage: jest.fn() }
      ;(global as any).__mockHostClients = [foreign, own]
      const { dispatch, message } = loadWorker('/sas9/minimal')
      const pending = dispatch(
        '/sas9/minimal/SASjsApi/drive/fileTree?_folderPath='
      )
      await settleUntil(
        () =>
          !!(
            own.postMessage.mock.calls.length ||
            foreign.postMessage.mock.calls.length
          )
      )
      expect(foreign.postMessage).not.toHaveBeenCalled()
      expect(own.postMessage).toHaveBeenCalledWith({ type: 'sasjs-need-drive' })
      await message({ type: 'sasjs-seed' }).pending
      await pending
    })
    it('asks a live page for the drive, and serves the request from the answer', async () => {
      const client = { postMessage: jest.fn() }
      ;(global as any).__mockHostClients = [client]

      const { dispatch, message } = loadWorker()

      const pending = dispatch(
        '/SASjsApi/drive/file?_filePath=' +
          encodeURIComponent(`${appLoc}/made.sas`)
      )

      await settleUntil(() => client.postMessage.mock.calls.length > 0)
      expect(client.postMessage).toHaveBeenCalledWith({
        type: 'sasjs-need-drive'
      })

      // the page answers with what it stored
      const load = message({
        type: 'sasjs-load',
        files: { [drivePath('made.sas')]: 'data;' }
      })
      await load.pending

      const response = await pending
      expect(response.status).toBe(200)
      expect(await response.text()).toBe('data;')
    })

    it('stops waiting when the page answers that nothing is stored', async () => {
      const client = { postMessage: jest.fn() }
      ;(global as any).__mockHostClients = [client]

      const { dispatch, message } = loadWorker()

      const pending = dispatch('/SASjsApi/drive/fileTree?_folderPath=')

      await settleUntil(() => client.postMessage.mock.calls.length > 0)
      const seed = message({ type: 'sasjs-seed' })
      await seed.pending

      // the seed is an answer: the request is served from it rather than after
      // the 2s wait plus the grace
      const response = await pending
      expect(response.status).toBe(200)
      expect(JSON.stringify(await response.json())).toContain('Public')
    })

    it('seeds when there is no page to ask', async () => {
      ;(global as any).__mockHostClients = []

      const { dispatch } = loadWorker()

      const response = await dispatch('/SASjsApi/drive/fileTree?_folderPath=')
      expect(response.status).toBe(200)
    })

    it('gives up waiting for a page that never answers', async () => {
      // a tab that took the ask and never replied: frozen, or closed between
      // the postMessage and the answer. The wait is bounded, so the request is
      // served from the seed instead of hanging this worker for ever.
      const client = { postMessage: jest.fn() }
      ;(global as any).__mockHostClients = [client]

      const { dispatch } = loadWorker()

      const response = await dispatch('/SASjsApi/drive/fileTree?_folderPath=')

      expect(client.postMessage).toHaveBeenCalledWith({
        type: 'sasjs-need-drive'
      })
      expect(response.status).toBe(200)
    }, 20000)

    it('answers a snapshot from the page drive, not the seed, on a restarted worker', async () => {
      // the export path reads the whole drive at once: seeding here would hand
      // the page a snapshot of the site's seed and drop the visitor's files
      const client = { postMessage: jest.fn() }
      ;(global as any).__mockHostClients = [client]

      const { message } = loadWorker()

      const snapshot = message({ type: 'sasjs-snapshot' })

      await settleUntil(() => client.postMessage.mock.calls.length > 0)
      const load = message({
        type: 'sasjs-load',
        files: { [drivePath('made.sas')]: 'data;' }
      })
      await load.pending
      await snapshot.pending

      expect(Object.keys(snapshot.replies[0].files)).toContain(
        drivePath('made.sas')
      )
    })

    it('answers stats from the page drive on a restarted worker', async () => {
      const client = { postMessage: jest.fn() }
      ;(global as any).__mockHostClients = [client]

      const { message } = loadWorker()

      const stats = message({ type: 'sasjs-stats' })

      await settleUntil(() => client.postMessage.mock.calls.length > 0)
      const load = message({
        type: 'sasjs-load',
        files: { [drivePath('made.sas')]: 'data;' }
      })
      await load.pending
      await stats.pending

      expect(stats.replies[0]).toEqual(
        expect.objectContaining({
          type: 'sasjs-stats',
          boot: expect.objectContaining({ restored: true })
        })
      )
    })

    it('asks one page at a time, so two tabs cannot install two drives', async () => {
      // a page answers by loading the drive into this worker: two answers are
      // two installs and the last one wins, so the second tab is a fallback for
      // the first not answering - never a second asker
      const first = { postMessage: jest.fn() }
      const second = { postMessage: jest.fn() }
      ;(global as any).__mockHostClients = [first, second]

      const { dispatch, message } = loadWorker()

      const pending = dispatch('/SASjsApi/drive/fileTree?_folderPath=')

      await settleUntil(() => first.postMessage.mock.calls.length > 0)
      expect(first.postMessage).toHaveBeenCalledWith({
        type: 'sasjs-need-drive'
      })
      expect(second.postMessage).not.toHaveBeenCalled()

      const load = message({
        type: 'sasjs-load',
        files: { [drivePath('made.sas')]: 'data;' }
      })
      await load.pending
      await pending

      // the answer came from the tab that was asked, so the other is never
      // brought in
      expect(second.postMessage).not.toHaveBeenCalled()
    })

    it('reports a failed write-back as a persist failure, not a refused drive', async () => {
      // the whole load chain used to end in one `errorKind: 'host'`, so a drive
      // the worker had accepted and loaded - whose write-back to the other tabs
      // failed - was reported as the payload being refused, and the page
      // answered that by deleting a drive it could still read
      const { message } = seeded()
      ;(global as any).__mockHostClients = () => {
        throw new Error('no clients')
      }
      // a seed installs the shipped drive, which marks it dirty: that is what
      // the worker has to write back, and what fails here

      const seed = message({ type: 'sasjs-seed' })
      await seed.pending

      const ack = seed.replies.find((r: any) => r.type === 'sasjs-seed-ack')
      expect(ack).toBeDefined()
      expect(ack.errorKind).toBe('persist')
      expect(ack.error).toContain('no clients')
    }, 20000)

    it('re-sends a batch whose write-back failed', async () => {
      // the runtime hands its dirty files over once, and the page is what writes
      // them down: a batch lost to a failed broadcast is lost from the drive
      // altogether unless the worker keeps it for the next report
      ;(global as any).__mockHostClients = () => {
        throw new Error('no clients')
      }

      const { message, dispatch } = seeded()
      const seed = message({ type: 'sasjs-seed' })
      await seed.pending
      expect(
        seed.replies.find((r: any) => r.type === 'sasjs-seed-ack').errorKind
      ).toBe('persist')

      const messages: any[] = []
      ;(global as any).__mockHostClients = [
        { postMessage: (m: any) => messages.push(m) }
      ]

      // any later persist carries the batch: a write is the ordinary one
      const created = await dispatch('/SASjsApi/drive/file', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          params: { filePath: '/Public/after.sas' },
          tables: [{ name: 'file', filename: 'after.sas', csv: btoa('after;') }]
        })
      })
      expect(created.status).toBe(200)

      const paths = messages
        .filter((m) => m.type === 'sasjs-persist')
        .flatMap((m) => Object.keys(m.files))
      // the seed's own change - it replaced the drive, which marks it - travels
      // with the batch of a request made long after it
      expect(paths).toContain('/appLoc')
      expect(paths.some((p) => p.includes('after.sas'))).toBe(true)
    }, 20000)

    it('persists a write when a closed tab fails the write-back', async () => {
      // the broadcast is not the write: a tab that closed since matchAll()
      // raises InvalidStateError, and one closed tab must not fail a write the
      // others just received - nor the request that is waiting on it
      const closed = jest.fn(() => {
        throw new Error('InvalidStateError')
      })
      const live = jest.fn()
      ;(global as any).__mockHostClients = () => [
        { id: 'tab-closed', postMessage: closed },
        { id: 'tab-live', postMessage: live }
      ]

      const { dispatch } = seeded()
      const created = await dispatch('/SASjsApi/drive/file', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          params: { filePath: '/Public/kept.sas' },
          tables: [{ name: 'file', filename: 'kept.sas', csv: btoa('kept;') }]
        })
      })

      expect(closed).toHaveBeenCalled()
      expect(created.status).toBe(200)

      const read = await dispatch(
        '/SASjsApi/drive/file?_filePath=' +
          encodeURIComponent('/Public/kept.sas')
      )
      expect(read.status).toBe(200)
    }, 20000)

    it('moves to the next tab when a tab cannot be reached', async () => {
      // a tab that closed between matchAll() and the send raises
      // InvalidStateError. That is this client not answering, not a verdict: if
      // it rejected the ask, every later ask would return the same rejection and
      // the worker would seed over the drive for the rest of its life
      const closed = jest.fn(() => {
        throw new Error('InvalidStateError')
      })
      const answering = jest.fn()
      ;(global as any).__mockHostClients = () => [
        { id: 'tab-closed', postMessage: closed },
        { id: 'tab-live', postMessage: answering }
      ]

      const { dispatch, message } = loadWorker()

      const pending = dispatch(
        '/SASjsApi/drive/file?_filePath=' +
          encodeURIComponent(`${appLoc}/made.sas`)
      )

      await settleUntil(() => answering.mock.calls.length > 0)
      expect(closed).toHaveBeenCalled()

      const load = message({
        type: 'sasjs-load',
        files: { [drivePath('made.sas')]: 'data;' }
      })
      await load.pending

      const response = await pending
      expect(response.status).toBe(200)
      expect(await response.text()).toBe('data;')
    }, 20000)

    it('reaches the second tab when the first one stays quiet', async () => {
      // the browser hands back FRESH Client objects on every matchAll(): only
      // the id is stable, so a set keyed on the object asks the first tab for
      // ever and never reaches the drive the second one holds
      const quiet = jest.fn()
      const answering = jest.fn()
      ;(global as any).__mockHostClients = () => [
        { id: 'tab-a', postMessage: quiet },
        { id: 'tab-b', postMessage: answering }
      ]

      const { dispatch, message } = loadWorker()

      const pending = dispatch('/SASjsApi/drive/fileTree?_folderPath=')

      await settleUntil(() => quiet.mock.calls.length > 0)
      // tab A never answers; when its wait expires the second tab is asked
      await settleUntil(() => answering.mock.calls.length > 0, 5000)
      expect(answering).toHaveBeenCalledWith({ type: 'sasjs-need-drive' })

      const load = message({
        type: 'sasjs-load',
        files: { [drivePath('made.sas')]: 'data;' }
      })
      await load.pending

      const response = await pending
      expect(response.status).toBe(200)
    }, 20000)

    it('asks again when a page is slow to answer, instead of seeding', async () => {
      // a tab whose read takes longer than one ask: the drive it eventually
      // sends must be installed, not replaced by a seed
      const client = { postMessage: jest.fn() }
      ;(global as any).__mockHostClients = [client]

      const { dispatch, message } = loadWorker()

      const pending = dispatch(
        '/SASjsApi/drive/file?_filePath=' +
          encodeURIComponent(`${appLoc}/made.sas`)
      )

      // the first ask goes unanswered
      await settleUntil(() => client.postMessage.mock.calls.length === 1)
      // ...and the worker asks again, rather than seeding when the wait expires
      await settleUntil(() => client.postMessage.mock.calls.length === 2, 5000)

      const load = message({
        type: 'sasjs-load',
        files: { [drivePath('made.sas')]: 'data;' }
      })
      await load.pending

      const response = await pending
      expect(response.status).toBe(200)
      expect(await response.text()).toBe('data;')
    }, 20000)

    it('fails the request rather than seeding over a drive the page cannot read', async () => {
      // storage that exists and cannot be read this moment: seeding would
      // replace it, which is the loss this whole handshake is here to prevent
      const client = { postMessage: jest.fn() }
      ;(global as any).__mockHostClients = [client]

      const { dispatch, message } = loadWorker()

      const pending = dispatch('/SASjsApi/drive/fileTree?_folderPath=')

      await settleUntil(() => client.postMessage.mock.calls.length > 0)
      message({ type: 'sasjs-drive-unavailable' })

      const response = await pending
      expect(response.status).toBe(500)
      expect(await response.text()).toContain('seeding would replace it')
    })

    it('asks once, however many requests arrive together', async () => {
      const client = { postMessage: jest.fn() }
      ;(global as any).__mockHostClients = [client]

      const { dispatch, message } = loadWorker()

      const first = dispatch('/SASjsApi/drive/fileTree?_folderPath=')
      const second = dispatch('/SASjsApi/drive/fileTree?_folderPath=')

      await settleUntil(() => client.postMessage.mock.calls.length > 0)
      await new Promise((resolve) => setTimeout(resolve, 50))

      expect(client.postMessage).toHaveBeenCalledTimes(1)

      const seed = message({ type: 'sasjs-seed' })
      await seed.pending
      await first
      await second
    })
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

    /**
     * The expectation kinds this harness asserts.
     *
     * A case that states one it does not implement fails rather than passing
     * unproven - `keys`, `shape` and `encoding` are asserted by the package's own
     * corpus run and not here, and a case that starts using them has to be told
     * so by this list rather than by silence.
     */
    const ASSERTED = ['status', 'error', 'partial', 'body', 'contents']

    const assertExpectations = async (
      response: any,
      testCase: CorpusCase
    ): Promise<void> => {
      const unasserted = Object.keys(testCase.expect).filter(
        (kind) => !ASSERTED.includes(kind)
      )
      if (unasserted.length)
        throw new Error(
          `${testCase.id}: this harness does not assert ${unasserted.join(', ')}`
        )

      expect(response.status).toBe(testCase.expect.status)

      const bytes =
        testCase.expect.contents instanceof Uint8Array
          ? new Uint8Array(await response.arrayBuffer())
          : undefined
      const text = bytes === undefined ? await response.text() : undefined
      const isJson = (response.headers.get('content-type') || '').includes(
        'application/json'
      )

      if (testCase.expect.error !== undefined) {
        // the routes that answer an envelope - the two deploy routes - send
        // `{status, message}`; the rest send the message itself as text, which is
        // what the server's `res.status(code).send(err.message)` does
        if (isJson) {
          const body = JSON.parse(text as string)
          expect(body.message).toBe(testCase.expect.error)
          // a refusal that states the envelope it expects is compared on the whole
          // of it, not only on the message
          if (testCase.expect.body !== undefined)
            expect(body).toEqual(testCase.expect.body)
        } else {
          // a case cannot state an envelope and be answered with text: one of the
          // two is wrong, and silence would hide which
          if (testCase.expect.body !== undefined)
            throw new Error(
              `${testCase.id}: the answer is text, so its body cannot be asserted`
            )
          expect(text).toBe(testCase.expect.error)
        }
        return
      }

      if (testCase.expect.contents !== undefined) {
        if (bytes !== undefined) expect(bytes).toEqual(testCase.expect.contents)
        else expect(text).toEqual(testCase.expect.contents)
        return
      }

      if (testCase.expect.body !== undefined)
        expect(JSON.parse(text as string)).toEqual(testCase.expect.body)

      if (testCase.expect.partial !== undefined)
        expect(JSON.parse(text as string)).toMatchObject(
          testCase.expect.partial
        )
    }

    /** Boot the identity and transport the case's subject as a bearer token. */
    const bootCase = async (worker: any, testCase: CorpusCase) => {
      const identity = testCase.identity || DEFAULT_IDENTITY
      const subject = testCase.request.subject
      // Older corpora omit both identity and subject and expect the host's
      // default administrator. New cases with an identity but no subject are
      // explicitly anonymous.
      if (!subject && !testCase.identity && !testCase.request.token) return
      let fixture = identity
      let token = testCase.request.token
      if (subject) {
        const user = identity.users.find(
          (entry) => entry.uid === subject.userId
        )
        if (!user)
          throw new Error(`${testCase.id}: subject user not in fixture`)
        if (token)
          throw new Error(`${testCase.id}: both subject and token stated`)
        token = 'corpus-subject-token'
        fixture = {
          ...identity,
          tokens: [
            ...(identity.tokens || []),
            {
              username: user.username,
              clientId: subject.clientId,
              accessToken: token,
              refreshToken: 'corpus-subject-refresh'
            }
          ]
        }
      }
      const { pending, replies } = worker.message({
        type: 'sasjs-seed',
        identity: fixture,
        subject: null
      })
      await pending
      if (replies[0]?.error) throw new Error(replies[0].error)
      return token
    }

    for (const testCase of DRIVE_CORPUS) {
      it(testCase.id, async () => {
        const worker = loadWorker()
        const token = await bootCase(worker, testCase)
        await seedDrive(worker.runtime, testCase)
        worker.refuseWrites(Boolean(testCase.unwritable))

        const { path: requestPath, init } = httpFor(testCase)
        if (token)
          init.headers = { ...init.headers, authorization: `Bearer ${token}` }
        const response = await worker.dispatch(requestPath, init)

        await assertExpectations(response, testCase)
        for (const path of testCase.expectDrive?.present || [])
          expect({
            path,
            exists: await worker.runtime.driveStore.exists(path)
          }).toEqual({
            path,
            exists: true
          })
        for (const path of testCase.expectDrive?.missing || [])
          expect({
            path,
            exists: await worker.runtime.driveStore.exists(path)
          }).toEqual({
            path,
            exists: false
          })
      })
    }

    /** The app a removal case names, as the corpus states it. */
    const CORPUS_APP = {
      appLoc: '/Public/myApp',
      streamWebFolder: 'web',
      publishedAt: '2026-01-01T00:00:00.000Z'
    }

    /**
     * A second app that no removal case names.
     *
     * Without it, a removal that ignored the id and deleted whatever was
     * published would pass both removal cases - the unknown-id one sees an empty
     * index either way. With it, the assertion after the answer is that the app
     * the id did *not* name is still listed.
     */
    const BYSTANDER = {
      id: '0b9a1c2d-3e4f-4a5b-8c6d-7e8f9a0b1c2d',
      name: 'bystander',
      appLoc: '/Public/bystander',
      streamWebFolder: 'web',
      publishedAt: '2026-01-01T00:00:00.000Z'
    }

    /**
     * The index a removal case starts from - built from the id the case asks to
     * remove, not from the answer it expects, so a host that removed some other
     * app would answer a different id and fail.
     */
    const seedIndex = async (runtime: any, testCase: CorpusCase) => {
      if (testCase.route !== 'DELETE /SASjsApi/drive/deploy') return

      const id = (testCase.request.body as any)?.id
      const named = (testCase.expect.partial as any)?.app
      const entries: any[] = [BYSTANDER]

      // the app the case expects to remove is published only when the case names
      // the id it removes: the unknown-id case asks for one that is not there, and
      // publishing it would make that case pass by accident. It goes in *after* the
      // bystander, so a removal that takes the first entry rather than the named
      // one removes the bystander and both assertions below fail.
      if (id !== undefined && named?.id === id)
        entries.push({ id, name: named.name ?? 'myApp', ...CORPUS_APP })

      await runtime.load({
        '/sasjs/drive/files/.sasjs/apps.json': JSON.stringify(entries)
      })
    }

    /**
     * The archive a client uploads, built from the tree the case states.
     *
     * The corpus is transport-agnostic: an upload case gives the tree the archive
     * has to expand to, and the folder in the query where the document puts it.
     * This host takes an archive, so the harness makes one - which is the only way
     * the mock's own expansion, and the tree it produces, gets exercised by the
     * cases that describe it.
     */
    const archiveOf = async (tree: any): Promise<Buffer> => {
      const files: { [name: string]: string | Uint8Array } = {}

      const walk = (members: any[], prefix: string) => {
        for (const member of members || []) {
          const at = prefix ? `${prefix}/${member.name}` : member.name
          if (member.type === 'folder') walk(member.members, at)
          else
            files[at] =
              member.encoding === 'base64'
                ? new Uint8Array(Buffer.from(String(member.code), 'base64'))
                : String(member.code ?? '')
        }
      }

      walk(tree?.members, '')

      return zipOf(files)
    }

    /**
     * The request a deploy case describes, as HTTP.
     *
     * The JSON and removal routes carry their fields as they are stated. The upload
     * route's body is an archive, so the tree becomes one and the fields the case
     * states beside it travel as form fields - a host's multipart body, with the
     * folder also in the query where the document puts it.
     */
    const deployRequest = async (testCase: CorpusCase) => {
      const { path: requestPath, init } = httpFor(testCase)
      if (!testCase.route.endsWith('/deploy/upload'))
        return { requestPath, init }

      const body = (testCase.request.body || {}) as any
      const archive = await archiveOf(body.fileTree)
      const form = new FormData()
      for (const [field, value] of Object.entries(body))
        if (field !== 'fileTree' && value !== undefined)
          form.set(field, String(value))
      form.set('file', new Blob([new Uint8Array(archive)]), 'deploy.zip')

      return { requestPath, init: { method: 'POST', body: form } }
    }

    /**
     * The deploy routes: the JSON form and the removal, plus the upload route
     * through an archive this harness builds from the tree the case states.
     *
     * The corpus describes an upload by what the archive has to expand to, so a
     * host that takes bytes can run the same case as one that is handed an
     * expansion - `deployRequest` makes the archive, and what it asserts is this
     * worker's own unzipping and tree-building rather than the corpus's
     * assumption. The one case that cannot travel this way is the expansion that is
     * not a tree, which the corpus marks `transport: 'expansion'`.
     *
     * The removal cases need an app to remove, so the index is seeded with the one
     * the case names and a bystander that must survive it. The state a case leaves
     * is checked too - `expectDrive` - because both deploy answers are `200` and
     * replacing a folder only differs from keeping it in what the drive holds
     * afterwards.
     */
    for (const testCase of DEPLOY_CORPUS.filter(
      // a case a host that takes an archive cannot produce, which the corpus marks
      // on the case itself rather than leaving each host to name it
      (entry) => entry.transport !== 'expansion'
    )) {
      it(testCase.id, async () => {
        const worker = loadWorker()
        await seedDrive(worker.runtime, testCase)
        await seedIndex(worker.runtime, testCase)
        worker.refuseWrites(Boolean(testCase.unwritable))

        const { requestPath, init } = await deployRequest(testCase)
        const response = await worker.dispatch(requestPath, init)

        await assertExpectations(response, testCase)

        // a removal takes the app the id names, and leaves the rest published
        if (testCase.route === 'DELETE /SASjsApi/drive/deploy') {
          const listing = await worker.dispatch('/app/apps.json')
          const ids = (await listing.json()).apps.map((app: any) => app.id)

          expect(ids).toContain(BYSTANDER.id)
          if (response.status === 200)
            expect(ids).not.toContain((testCase.request.body as any)?.id)
        }

        for (const path of testCase.expectDrive?.present || []) {
          const file = await worker.dispatch(
            '/SASjsApi/drive/file?_filePath=' + encodeURIComponent(path)
          )
          expect({ path, status: file.status }).toEqual({ path, status: 200 })
        }

        for (const path of testCase.expectDrive?.missing || []) {
          const file = await worker.dispatch(
            '/SASjsApi/drive/file?_filePath=' + encodeURIComponent(path)
          )
          expect({ path, status: file.status }).toEqual({ path, status: 404 })
        }
      })
    }
  })

  /**
   * The identity and record corpora, over the worker's HTTP surface.
   *
   * The same cases @sasjs/api runs against its own services, and the server runs
   * against a live sasjs/server. A failure here is this host's transport, the
   * fixture it booted, or a route it does not answer - never the decisions, which
   * are the package's.
   */
  describe('identity and record conformance', () => {
    /**
     * Boots the worker from a fixture, the way the page does: the case's own
     * identity, and `subject: null` for no implicit caller, so a case that
     * expects the answer an anonymous request gets is not silently answered as
     * the fixture's administrator.
     */
    const boot = async (
      worker: any,
      identity: IdentityFixture,
      subject: string | null = null
    ) => {
      const { pending } = worker.message({
        type: 'sasjs-seed',
        identity,
        subject
      })
      await pending
    }

    /** The request a case describes, as HTTP: path parameters filled, token sent. */
    const httpForCase = (testCase: CorpusCase) => {
      const [method, routePath] = testCase.route.split(' ')
      const filled = routePath.replace(/\{(\w+)\}/g, (_match, name: string) =>
        encodeURIComponent(String((testCase.request.params || {})[name]))
      )
      const query = new URLSearchParams()
      for (const [key, value] of Object.entries(testCase.request.query || {})) {
        if (value !== undefined) query.set(key, String(value))
      }
      const suffix = query.toString() ? `?${query}` : ''
      const headers: Record<string, string> = {}
      const init: any = { method, headers }

      if (testCase.request.token)
        headers.authorization = 'Bearer ' + testCase.request.token

      if (testCase.request.body !== undefined) {
        init.body = JSON.stringify(testCase.request.body)
        headers['content-type'] = 'application/json'
      }

      return { path: filled + suffix, init }
    }

    /** The assertions the package's own corpus makes, against an HTTP answer. */
    const expectAnswer = async (testCase: CorpusCase, response: Response) => {
      expect({ case: testCase.id, status: response.status }).toEqual({
        case: testCase.id,
        status: testCase.expect.status
      })

      const want = testCase.expect
      const contentType = response.headers.get('content-type') || ''
      const isJson = contentType.includes('application/json')

      if (want.contents !== undefined) {
        const sent =
          want.encoding === 'text'
            ? await response.text()
            : new Uint8Array(await response.arrayBuffer())
        const expected =
          typeof want.contents === 'string'
            ? want.encoding === 'text'
              ? want.contents
              : new TextEncoder().encode(want.contents)
            : want.contents
        expect(sent).toEqual(expected)
        return
      }

      if (want.error !== undefined) {
        const error = isJson
          ? (await response.json()).message
          : await response.text()
        expect({ case: testCase.id, error }).toEqual({
          case: testCase.id,
          error: want.error
        })
        return
      }

      if (
        want.body === undefined &&
        want.partial === undefined &&
        want.keys === undefined &&
        want.shape === undefined
      )
        return

      const body = await response.json()

      if (want.body !== undefined) expect(body).toEqual(want.body)

      if (want.partial !== undefined) expect(body).toMatchObject(want.partial)

      if (want.keys !== undefined)
        expect(Object.keys(body as object).sort()).toEqual(
          want.keys.slice().sort()
        )

      if (want.shape !== undefined) {
        const { required, optional = [] } = want.shape
        const present = Object.keys(body as object)
        const allowed = [...required, ...optional]

        expect({
          case: testCase.id,
          missing: required.filter((key) => !present.includes(key)),
          unexpected: present.filter((key) => !allowed.includes(key))
        }).toEqual({ case: testCase.id, missing: [], unexpected: [] })
      }
    }

    for (const testCase of [...IDENTITY_CORPUS, ...RECORD_CORPUS]) {
      it(`${testCase.id}: ${testCase.description}`, async () => {
        const worker = loadWorker()
        await boot(worker, testCase.identity || DEFAULT_IDENTITY)

        const { path: requestPath, init } = httpForCase(testCase)
        await expectAnswer(testCase, await worker.dispatch(requestPath, init))
      })
    }

    it('answers as the fixture administrator when no subject was chosen', async () => {
      const worker = loadWorker()

      const response = await worker.dispatch('/SASjsApi/permission')
      const rules = await response.json()

      expect(response.status).toBe(200)
      expect(rules.length).toBe(3)
      expect(rules.map((rule: any) => rule.uid)).toEqual([
        'rule-routes',
        'rule-execute',
        'rule-code'
      ])
    })

    it('signs in as another account, changing the permission answer and the token subject', async () => {
      const worker = loadWorker()

      const { replies, pending } = worker.message({
        type: 'sasjs-as',
        username: 'sasjsuser'
      })
      await pending

      const ack = replies[0]
      expect(ack.username).toBe('sasjsuser')
      expect(ack.accessToken).toBeTruthy()

      // what the site now sees: only the routes the restricted account is granted
      const routes = await worker.dispatch('/SASjsApi/info/myAuthorizedRoutes')
      expect((await routes.json()).paths).toEqual([
        '/AppStream',
        '/SASjsApi/stp/execute',
        '/SASjsApi/drive/file'
      ])

      // and the pair names that account, so a caller can send it as a token
      const session = await worker.dispatch('/SASjsApi/session', {
        headers: { authorization: 'Bearer ' + ack.accessToken }
      })
      expect(session.status).toBe(200)
      expect((await session.json()).username).toBe('sasjsuser')
    })

    it('refuses a run the fixture denies, and admits one it grants', async () => {
      const worker = seeded()

      // the administrator may run a buffer, as the API's own corpus says
      const asAdmin = await worker.dispatch(
        '/SASjsApi/code/execute',
        runRequest({ code: 'data _null_; run;', runTime: 'sas' })
      )
      expect(asAdmin.status).toBe(200)

      await worker.message({ type: 'sasjs-as', username: 'sasjsuser' }).pending

      // the fixture denies this account /SASjsApi/code/execute with a user rule,
      // and the rule refuses the call rather than only the menu entry beside it
      const denied = await worker.dispatch(
        '/SASjsApi/code/execute',
        runRequest({ code: 'data _null_; run;', runTime: 'sas' })
      )
      expect(denied.status).toBe(401)
      expect((await denied.json()).message).toBe('Unauthorized')

      // the same account holds a group grant on stp/execute, so the refusal above
      // is the rule and not a blanket refusal of everything it asks for
      const granted = await worker.dispatch(
        '/SASjsApi/stp/execute?_program=' +
          encodeURIComponent(`${appLoc}/services/public/getdata`)
      )
      expect(granted.status).toBe(200)
    })

    it('returns to the administrator with no account named, or with "admin"', async () => {
      const worker = loadWorker()

      await worker.message({ type: 'sasjs-as', username: 'sasjsuser' }).pending
      const back = worker.message({ type: 'sasjs-as', username: 'admin' })
      await back.pending

      expect(back.replies[0].username).toBe('sasjsadmin')

      const routes = await worker.dispatch('/SASjsApi/info/myAuthorizedRoutes')
      // a route only the administrator's rules reach: the restricted account's
      // list is the three entries the corpus pins
      expect((await routes.json()).paths).toContain('/SASjsApi/code/execute')
    })

    it('refuses an unknown account by name, naming the accounts the fixture holds', async () => {
      const worker = loadWorker()

      const { replies, pending } = worker.message({
        type: 'sasjs-as',
        username: 'nobody'
      })
      await pending

      expect(replies[0].error).toContain('no account named "nobody"')
      expect(replies[0].error).toContain('sasjsadmin')
      expect(replies[0].accessToken).toBeUndefined()
    })

    it('refuses a persisted fixture in a format this build does not read, by name', async () => {
      const worker = loadWorker()

      const { replies, pending } = worker.message({
        type: 'sasjs-seed',
        identity: { ...DEFAULT_IDENTITY, format: 0 },
        subject: null
      })
      await pending

      expect(replies[0].error).toContain('states format 0')
      expect(replies[0].error).toContain('Rebuild the site')
      // the page drops the stored row ONLY for this kind: a host-side failure
      // must not take the visitor's accounts with it
      expect(replies[0].errorKind).toBe('identity')
    })

    it('refuses a shipped fixture it cannot read, naming the file', async () => {
      ;(global as any).__sasjsIdentity = { ...DEFAULT_IDENTITY, format: 7 }
      const worker = loadWorker()

      const response = await worker.dispatch('/SASjsApi/permission')
      const body = await response.json()

      expect(response.status).toBe(500)
      expect(body.message).toContain('host/identity.json cannot be used')
      expect(body.message).toContain('states format 7')
    })

    it('replies with the error when a reset cannot read the shipped fixture', async () => {
      // the page waits for this ack: silence is read as success, and a reset is
      // the way out of a site whose fixture broke
      ;(global as any).__sasjsIdentity = { ...DEFAULT_IDENTITY, format: 4 }
      const worker = loadWorker()
      // a request first, so the failure is the cached one the site already has
      await worker.dispatch('/SASjsApi/permission')

      const { replies, pending } = worker.message({ type: 'sasjs-reset' })
      await pending

      expect(replies[0].type).toBe('sasjs-reset-ack')
      expect(replies[0].error).toContain('host/identity.json cannot be used')
      expect(replies[0].boot).toBeUndefined()
    })

    it('falls back to the packaged fixture when the site ships no identity file', async () => {
      ;(global as any).__sasjsIdentity = 'missing'
      const worker = loadWorker()

      const response = await worker.dispatch('/SASjsApi/permission')
      const rules = await response.json()

      expect(response.status).toBe(200)
      expect(rules.length).toBe(3)
    })

    it('reports an account created through the routes, so the page can store it', async () => {
      const worker = loadWorker()
      const sent: any[] = []
      ;(global as any).__mockHostClients = [
        { postMessage: (message: any) => sent.push(message) }
      ]

      const response = await worker.dispatch('/SASjsApi/user', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          username: 'newuser',
          displayName: 'New User',
          password: 'newpass',
          isAdmin: false,
          isActive: true
        })
      })

      expect(response.status).toBe(200)

      const persisted = sent.find(
        (message) => message.type === 'sasjs-persist' && message.identity
      )
      expect(
        persisted.identity.users.map((user: any) => user.username)
      ).toContain('newuser')

      delete (global as any).__mockHostClients
    })

    it('restores the shipped fixture on reset', async () => {
      const worker = loadWorker()

      await worker.dispatch('/SASjsApi/user', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          username: 'newuser',
          displayName: 'New User',
          password: 'newpass',
          isAdmin: false,
          isActive: true
        })
      })
      await worker.message({ type: 'sasjs-as', username: 'sasjsuser' }).pending

      await worker.message({ type: 'sasjs-reset' }).pending

      const users = await worker.dispatch('/SASjsApi/user')
      expect((await users.json()).map((user: any) => user.username)).toEqual([
        'sasjsadmin',
        'sasjsuser'
      ])

      // the caller is the administrator again, not the account that was chosen
      const routes = await worker.dispatch('/SASjsApi/info/myAuthorizedRoutes')
      // a route only the administrator's rules reach: the restricted account's
      // list is the three entries the corpus pins
      expect((await routes.json()).paths).toContain('/SASjsApi/code/execute')
    })
  })

  describe('the read a streamed deployment links to', () => {
    const asset = (name: string) => drivePath(`services/web/${name}`)

    it.each(['/StoredProgram', '/SASJobExecution'])(
      'accepts a mixed-case, encoded file parameter on %s',
      async (tier) => {
        const worker = seeded()
        await worker.runtime.load({ [asset('main.js')]: 'console.log(1)' })

        const response = await worker.dispatch(
          `${tier}?%5FfIlE=${appLoc}/services/web/main.js`
        )

        expect(response.status).toBe(200)
        expect(await response.text()).toBe('console.log(1)')
      }
    )

    it.each(['/StoredProgram', '/SASJobExecution'])(
      'refuses a mixed-case filePath together with file on %s',
      async (tier) => {
        const worker = seeded()
        await worker.runtime.load({ [asset('main.js')]: 'console.log(1)' })
        const response = await worker.dispatch(
          `${tier}?_FILE=${appLoc}/services/web/main.js` +
            `&%5ffIlEpAtH=${appLoc}/services/web/main.js`
        )
        expect(response.status).toBe(400)
        expect(await response.text()).toBe(
          'Exactly one of "_filePath" and "_FILE" may be given.'
        )
      }
    )

    it.each(['/StoredProgram', '/SASJobExecution'])(
      'rejects repeated file names on %s',
      async (tier) => {
        const worker = seeded()
        await worker.runtime.load({
          [asset('first.js')]: 'first',
          [asset('last.js')]: 'last'
        })
        const response = await worker.dispatch(
          `${tier}?_FILE=${appLoc}/services/web/first.js` +
            `&%5ffile=${appLoc}/services/web/last.js`
        )
        expect(response.status).toBe(400)
        expect(await response.text()).toContain('"_FILE" must be a string')
      }
    )

    it.each(['/StoredProgram', '/SASJobExecution'])(
      'rejects mixed-case controls even when one is empty on %s',
      async (tier) => {
        const worker = seeded()
        const response = await worker.dispatch(
          `${tier}?%5ffile=&_ProGram=${appLoc}/services/public/getdata`
        )
        expect(response.status).toBe(400)
        expect(await response.text()).toBe(
          'Exactly one of "_program" and "_FILE" may be given.'
        )
      }
    )

    it.each(['GET', 'POST'])(
      'rejects empty or duplicate web-tier debug on %s',
      async (method) => {
        const worker = seeded()
        await worker.runtime.load({
          [drivePath('services/public/debug.js')]: "_webout = 'ran'"
        })
        const path = `/StoredProgram?_program=${appLoc}/services/public/debug`
        for (const [query, message] of [
          ['_DeBuG=', '"_debug" is not allowed to be empty'],
          ['_debug=1&_DEBUG=2', '"_debug" must be one of [number, string]']
        ]) {
          const response = await worker.dispatch(`${path}&${query}`, { method })
          expect(response.status).toBe(400)
          expect(await response.text()).toContain(message)
        }
      }
    )

    it.each([
      ['_DeBuG=', '"_debug" is not allowed to be empty'],
      ['_debug=1&_DEBUG=2', '"_debug" must be one of [number, string]']
    ])(
      'rejects invalid SAS9 POST query %s before execution',
      async (query, message) => {
        const worker = seeded()
        await worker.runtime.load({
          [drivePath('services/public/invaliddebug.js')]:
            "fs.writeFileSync('/sasjs/drive/files/invaliddebug.txt', 'ran')"
        })
        const response = await worker.dispatch(
          `/SASStoredProcess/do?_program=${appLoc}/services/public/invaliddebug&${query}`,
          { method: 'POST' }
        )
        expect(response.status).toBe(400)
        expect(await response.text()).toContain(message)
        expect(
          await worker.runtime.driveStore.exists('/invaliddebug.txt')
        ).toBe(false)
      }
    )

    it('passes duplicate SAS9 GET parameters through as arrays', async () => {
      const worker = seeded()
      await worker.runtime.load({
        [drivePath('services/public/arrays.js')]:
          '_webout = JSON.stringify(_sasjs_fetch_context.params)'
      })
      const response = await worker.dispatch(
        `/SASStoredProcess/do?_program=${appLoc}/services/public/arrays&Region=a&REGION=b`
      )
      expect(response.status).toBe(200)
      expect((await response.json()).region).toEqual(['a', 'b'])
    })

    it('rejects a body-only uppercase SAS9 POST program before execution', async () => {
      const worker = seeded()
      const program = `${appLoc}/services/public/uppercaseprogram`
      await worker.runtime.load({
        [drivePath('services/public/uppercaseprogram.js')]:
          "fs.writeFileSync('/sasjs/drive/files/uppercaseprogram.txt', 'ran')"
      })
      const response = await worker.dispatch('/SASStoredProcess/do', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ _PROGRAM: program })
      })
      expect(response.status).toBe(400)
      expect(
        await worker.runtime.driveStore.exists('/uppercaseprogram.txt')
      ).toBe(false)
    })

    it('selects the lowercase SAS9 POST program regardless of body key order', async () => {
      const worker = seeded()
      const program = `${appLoc}/services/public/bodyprogram`
      await worker.runtime.load({
        [drivePath('services/public/bodyprogram.js')]: "_webout = 'correct'"
      })
      for (const body of [
        { _program: program, _PROGRAM: '/wrong' },
        { _PROGRAM: '/wrong', _program: program }
      ]) {
        const response = await worker.dispatch('/SASStoredProcess/do', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body)
        })
        expect(response.status).toBe(200)
        expect(await response.text()).toBe('correct')
      }
    })

    it.each(['/StoredProgram', '/SASStoredProcess/do'])(
      'does not run the body program when %s query program is empty',
      async (tier) => {
        const worker = seeded()
        const program = `${appLoc}/services/public/emptyquery`
        await worker.runtime.load({
          [drivePath('services/public/emptyquery.js')]:
            "fs.writeFileSync('/sasjs/drive/files/emptyquery.txt', 'ran')"
        })
        const response = await worker.dispatch(`${tier}?_program=`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ _program: program })
        })
        expect(response.status).not.toBe(200)
        expect(await worker.runtime.driveStore.exists('/emptyquery.txt')).toBe(
          false
        )
      }
    )

    it('does not let URL parameters shadow local var bindings', async () => {
      const worker = seeded()
      await worker.runtime.load({
        [drivePath('services/public/localvar.js')]:
          'var Count = 5; Count++; _webout = String(Count)'
      })
      const response = await worker.dispatch(
        `/StoredProgram?_program=${appLoc}/services/public/localvar&count=99`
      )
      expect(response.status).toBe(200)
      expect(await response.text()).toBe('6')
    })

    it.each([
      ['/StoredProgram', 'GET'],
      ['/StoredProgram', 'POST'],
      ['/SASStoredProcess/do', 'POST']
    ])(
      'rejects duplicate custom URL names without running on %s %s',
      async (tier, method) => {
        const worker = seeded()
        await worker.runtime.load({
          [drivePath('services/public/duplicate.js')]:
            "fs.writeFileSync('/sasjs/drive/files/duplicate.txt', 'executed')"
        })
        for (const query of ['region=a&region=b', 'Region=a&%52EGION=b']) {
          const response = await worker.dispatch(
            `${tier}?_program=${appLoc}/services/public/duplicate&${query}`,
            method === 'POST'
              ? {
                  method,
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify({ region: 'body' })
                }
              : { method }
          )
          expect(response.status).toBe(400)
          expect((await response.json()).message).toBe(
            '"region" must be one of [string, number]'
          )
          expect(await worker.runtime.driveStore.exists('/duplicate.txt')).toBe(
            false
          )
        }
      }
    )

    it('does not execute programs on the SASJobExecution tier', async () => {
      const worker = seeded()
      await worker.runtime.load({
        [drivePath('services/public/notrun.js')]:
          "fs.writeFileSync('/sasjs/drive/files/notrun.txt', 'executed')"
      })
      const path = `/SASJobExecution?_program=${appLoc}/services/public/notrun`
      const get = await worker.dispatch(path)
      expect(get.status).toBe(404)
      const post = await worker.dispatch(path, { method: 'POST' })
      expect(post.status).toBe(200)
      expect(await post.json()).toEqual({ test: 'test' })
      expect(await worker.runtime.driveStore.exists('/notrun.txt')).toBe(false)
    })

    it.each([
      ['0', false, '_DeBuG'],
      ['0', false, '_debug'],
      ['130', false, '_DeBuG'],
      ['131', true, '_DeBuG'],
      ['log', true, '_DeBuG']
    ])(
      'honours tier POST body debug %s over query debug',
      async (debug, framed, key) => {
        const worker = seeded()
        await worker.runtime.load({
          [drivePath('services/public/debugmerge.js')]: "_webout = 'unframed'"
        })
        const response = await worker.dispatch(
          `/StoredProgram?_program=${appLoc}/services/public/debugmerge&_debug=131`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ [key]: debug })
          }
        )
        expect(response.status).toBe(200)
        const body = await response.text()
        expect(body.startsWith('unframed')).toBe(true)
        expect(body.includes(LOGS_SEPARATOR)).toBe(framed)
        if (!framed) expect(body).toBe('unframed')
      }
    )

    it('merges tier POST body collisions into the canonical query name', async () => {
      const worker = seeded()
      await worker.runtime.load({
        [drivePath('services/public/merge.js')]:
          '_webout = JSON.stringify({ region, params: _sasjs_fetch_context.params, OtherField, _program })'
      })
      const path = `/StoredProgram?_program=${appLoc}/services/public/merge&ReGiOn=query`
      const response = await worker.dispatch(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          Region: 'body',
          OtherField: 'kept',
          _PrOgRaM: '/wrong'
        })
      })
      expect(response.status).toBe(200)
      const output = await response.json()
      expect(output.region).toBe('body')
      expect(output.OtherField).toBe('kept')
      expect(output.params.region).toBe('body')
      expect(output.params.Region).toBeUndefined()
      expect(output.params._PrOgRaM).toBeUndefined()
      expect(output._program).toBe(`${appLoc}/services/public/merge`)
    })

    it.each(['/StoredProgram', '/SASStoredProcess/do'])(
      'normalizes every URL name on %s without changing values',
      async (tier) => {
        const worker = seeded()
        await worker.runtime.load({
          [drivePath('services/public/case.js')]:
            `_webout = JSON.stringify({ value: customerid, params: _sasjs_fetch_context.params })`
        })
        for (const name of ['customerid', 'CUSTOMERID', '%43ustomerId']) {
          const response = await worker.dispatch(
            `${tier}?_PROGRAM=${appLoc}/services/public/case&${name}=Keep%2FCase%3DYes%2B%25&EMPTY=&Unicode=%C3%A9&bad-name=kept`
          )
          expect(response.status).toBe(200)
          const output = await response.json()
          expect(output.value).toBe('Keep/Case=Yes+%')
          expect(output.params).toMatchObject({
            customerid: 'Keep/Case=Yes+%',
            empty: '',
            unicode: 'é',
            'bad-name': 'kept'
          })
          expect(output.params.CustomerId).toBeUndefined()
        }
      }
    )

    it.each(['/StoredProgram', '/SASStoredProcess/do'])(
      'rejects repeated program names without execution on %s',
      async (tier) => {
        const worker = seeded()
        await worker.runtime.load({
          [drivePath('services/public/repeat.js')]:
            `fs.writeFileSync('/sasjs/drive/files/repeat.txt', 'executed')`
        })
        const program = `${appLoc}/services/public/repeat`
        const response = await worker.dispatch(
          `${tier}?_program=${program}&_PROGRAM=${program}`
        )
        expect(response.status).toBe(400)
        expect((await response.json()).message).toBe(
          '"_program" must be a string'
        )
        expect(await worker.runtime.driveStore.exists('/repeat.txt')).toBe(
          false
        )
      }
    )

    it.each(['/StoredProgram', '/SASStoredProcess/do'])(
      'honours mixed-case debug and denies invalid mixed-case tokens on %s',
      async (tier) => {
        const worker = seeded()
        await worker.runtime.load({
          [drivePath('services/public/security.js')]: "_webout = 'executed'"
        })
        const path = `${tier}?_program=${appLoc}/services/public/security`
        const debug = await worker.dispatch(path + '&_DeBuG=131')
        expect(debug.status).toBe(200)
        expect(await debug.text()).toContain(
          tier === '/SASStoredProcess/do' ? '>>weboutBEGIN<<' : LOGS_SEPARATOR
        )
        const denied = await worker.dispatch(
          path + '&AcCeSs_ToKeN=invalid-token'
        )
        expect(denied.status).toBe(401)
        expect(await denied.text()).not.toContain('executed')
      }
    )

    it.each(['/StoredProgram', '/SASJobExecution'])(
      'keeps duplicate query tokens from bypassing authentication on %s',
      async (tier) => {
        const worker = seeded()
        await worker.runtime.load({ [asset('private.js')]: 'private' })
        const path = `${tier}?_FILE=${appLoc}/services/web/private.js`
        const denied = await worker.dispatch(
          path + '&access_token=&ACCESS_TOKEN=invalid-token'
        )
        expect(denied.status).toBe(401)
        expect(await denied.text()).not.toBe('private')
        const headerDenied = await worker.dispatch(path + '&ACCESS_TOKEN=', {
          headers: { authorization: 'Bearer invalid-token' }
        })
        expect(headerDenied.status).toBe(401)
      }
    )

    it('keeps runner bindings protected and preserves canonical parameter names', async () => {
      const worker = seeded()
      await worker.runtime.load({
        [drivePath('services/public/reserved.js')]:
          `_webout = JSON.stringify({ fs: typeof fs.readFileSync, output: typeof _webout, webin: _WEBIN_FILE_COUNT, stored: _sasjs_fetch_context.params.fs, invalid: _sasjs_fetch_context.params['bad-name'] })`
      })
      const response = await worker.dispatch(
        `/StoredProgram?_program=${appLoc}/services/public/reserved&Fs=attacker&_WEBOUT=attacker&_webin_file_count=42&bad-name=kept`
      )
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({
        fs: 'function',
        output: 'string',
        webin: 0,
        stored: 'attacker',
        invalid: 'kept'
      })
    })

    it('leaves direct API query names case-sensitive', async () => {
      const worker = seeded()
      await worker.runtime.load({
        [drivePath('services/public/direct.js')]:
          `_webout = JSON.stringify({ MixedParam, params: _sasjs_fetch_context.params })`
      })
      const response = await worker.dispatch(
        `/SASjsApi/stp/execute?_program=${appLoc}/services/public/direct&MixedParam=Keep`
      )
      expect(response.status).toBe(200)
      const output = await response.json()
      expect(output.MixedParam).toBe('Keep')
      expect(output.params.MixedParam).toBe('Keep')
      expect(output.params.mixedparam).toBeUndefined()
      const invalid = await worker.dispatch(
        `/SASjsApi/stp/execute?_PROGRAM=${appLoc}/services/public/direct`
      )
      expect(invalid.status).toBe(400)
      expect(await invalid.json()).toEqual({
        message: '"_program" is required'
      })
    })

    it.each(['/StoredProgram', '/SASJobExecution'])(
      'does not load shards for repeated file names on %s',
      async (tier) => {
        const first = asset('first.js')
        const last = asset('last.js')
        ;(global as any).__sasjsShards = {
          index: {
            format: DRIVE_FORMAT,
            sharded: true,
            boot: 0,
            entries: {
              [first]: { shard: 1, bytes: 5 },
              [last]: { shard: 2, bytes: 4 }
            },
            shards: [
              { id: 0, file: 'host/vfs-snapshot-0.json' },
              { id: 1, file: 'host/vfs-snapshot-1.json' },
              { id: 2, file: 'host/vfs-snapshot-2.json' }
            ]
          },
          0: {},
          1: { [first]: 'first' },
          2: { [last]: 'last' }
        }
        const worker = loadWorker('', { skipLint: true })
        const response = await worker.dispatch(
          `${tier}?_FILE=${appLoc}/services/web/first.js` +
            `&_file=${appLoc}/services/web/last.js`
        )
        expect(response.status).toBe(400)
        expect((global as any).__sasjsShardFetches).not.toContain(2)
        expect((global as any).__sasjsShardFetches).not.toContain(1)
      }
    )

    it.each(['/StoredProgram', '/SASJobExecution'])(
      'keeps authentication on a mixed-case file request to %s',
      async (tier) => {
        const worker = seeded()
        await worker.runtime.load({ [asset('private.js')]: 'private' })
        const response = await worker.dispatch(
          `${tier}?_fIlE=${appLoc}/services/web/private.js`,
          { headers: { authorization: 'Bearer invalid-token' } }
        )
        expect(response.status).toBe(401)
        expect(await response.text()).not.toBe('private')
      }
    )

    it('keeps execution grants on a mixed-case program request', async () => {
      const identity = {
        ...DEFAULT_IDENTITY,
        permissions: [
          ...DEFAULT_IDENTITY.permissions,
          {
            uid: 'deny-tier-execution',
            path: '/SASjsApi/stp/execute',
            type: 'Route',
            setting: 'Deny',
            user: 'user-restricted'
          }
        ]
      }
      const worker = loadWorker('', { skipLint: true })
      const boot = worker.message({
        type: 'sasjs-seed',
        identity,
        subject: 'sasjsuser'
      })
      await boot.pending
      expect(boot.replies[0].error).toBeUndefined()
      worker.runtime.load({
        [drivePath('services/public/security.js')]:
          "fs.writeFileSync('/sasjs/drive/files/executed.txt', 'yes'); _webout = 'executed'"
      })
      const requestPath = `/StoredProgram?_PROGRAM=${appLoc}/services/public/security`
      const denied = await worker.dispatch(requestPath)
      expect(denied.status).toBe(401)
      expect(await worker.runtime.driveStore.exists('/executed.txt')).toBe(
        false
      )
      await worker.message({ type: 'sasjs-as', username: 'sasjsadmin' }).pending
      const granted = await worker.dispatch(requestPath)
      expect(granted.status).toBe(200)
      expect(await granted.text()).toBe('executed')
    })

    it(`answers the SASjs tier spelling, typed as a script`, async () => {
      const worker = seeded()
      await worker.runtime.load({ [asset('main.js')]: 'console.log(1)' })

      const response = await worker.dispatch(
        `/StoredProgram?_FILE=${appLoc}/services/web/main.js`
      )

      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toContain('text/javascript')
      expect(await response.text()).toBe('console.log(1)')
    })

    it(`answers the estate spelling for an asset, typed as a script`, async () => {
      const worker = seeded()
      await worker.runtime.load({ [asset('main.js')]: 'console.log(1)' })

      const response = await worker.dispatch(
        `/SASJobExecution?_FILE=${appLoc}/services/web/main.js`
      )

      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toContain('text/javascript')
      expect(await response.text()).toBe('console.log(1)')
    })

    it('answers the API spelling of the same read', async () => {
      const worker = seeded()
      await worker.runtime.load({ [asset('style.css')]: 'body{}' })

      const response = await worker.dispatch(
        `/SASjsApi/drive/file?_FILE=${appLoc}/services/web/style.css`
      )

      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toContain('text/css')
      expect(await response.text()).toBe('body{}')
    })

    it('serves the entry page as HTML, so it renders', async () => {
      const worker = seeded()
      await worker.runtime.load({
        [drivePath('services/clickme.html')]: '<html>app</html>'
      })

      const response = await worker.dispatch(
        `/SASJobExecution?_FILE=${appLoc}/services/clickme.html`
      )

      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toContain('text/html')
    })

    it('refuses a request naming a program and a file, as the server does', async () => {
      const worker = seeded()
      await worker.runtime.load({ [asset('main.js')]: 'console.log(1)' })

      const response = await worker.dispatch(
        `/StoredProgram?_program=${appLoc}/services/web/main&_FILE=${appLoc}/services/web/main.js`
      )

      // the server refuses rather than picking one, and the mock reproduces the
      // refusal instead of answering the file: a site that worked here and 400'd
      // on the server would be worse than one that fails in both
      expect(response.status).toBe(400)
      expect(await response.text()).toBe(
        'Exactly one of "_program" and "_FILE" may be given.'
      )
    })

    it('refuses both parameters on the estate spelling too', async () => {
      const worker = seeded()
      await worker.runtime.load({ [asset('main.js')]: 'console.log(1)' })

      const response = await worker.dispatch(
        `/SASJobExecution?_FILE=${appLoc}/services/web/main.js&_program=${appLoc}/services/web/main`
      )

      // the refusal is by parameter, not by tier: a Viya-built page naming both
      // gets the same 400 here as it does against the server
      expect(response.status).toBe(400)
      expect(await response.text()).toBe(
        'Exactly one of "_program" and "_FILE" may be given.'
      )
    })

    it('answers an empty file name with the package refusal, not a 404', async () => {
      const worker = seeded()

      const response = await worker.dispatch(`/StoredProgram?_FILE=`)

      // presence sends it to the read, as it does on the server; the empty name
      // is then the package's to refuse. Falling through to "not part of the
      // API" answered a 404 no host gives
      expect(response.status).toBe(400)
      expect(await response.text()).toBe(`Can't get file outside drive.`)
    })

    it('refuses both parameters when the second is present but empty', async () => {
      const worker = seeded()
      await worker.runtime.load({ [asset('main.js')]: 'console.log(1)' })

      const response = await worker.dispatch(
        `/StoredProgram?_FILE=${appLoc}/services/web/main.js&_program=`
      )

      // presence, not truthiness: the server tests `!== undefined` and Express
      // parses a bare `_program=` to the empty string, so this is refused there
      // and must be refused here rather than answered as the file
      expect(response.status).toBe(400)
      expect(await response.text()).toBe(
        'Exactly one of "_program" and "_FILE" may be given.'
      )
    })

    it('refuses a request that names the file twice, as the package does', async () => {
      const worker = seeded()
      await worker.runtime.load({ [asset('main.js')]: 'console.log(1)' })

      const response = await worker.dispatch(
        `/SASJobExecution?_FILE=${appLoc}/services/web/main.js` +
          `&_filePath=${appLoc}/services/web/main.js`
      )

      expect(response.status).toBe(400)
    })

    it(`runs a program asked for through the SASjs tier`, async () => {
      const worker = seeded()

      const response = await worker.dispatch(
        `/StoredProgram?_program=` +
          encodeURIComponent(`${appLoc}/services/public/getdata.js`)
      )

      // the same answer the API's own execute route gives: the tier is a
      // spelling of that operation, not a second implementation of it
      expect(response.status).toBe(200)
      expect(await response.text()).toBe('seeded')
    })

    it(`answers a missing asset the way the estate does, not as a 404`, async () => {
      const worker = seeded()

      const response = await worker.dispatch(
        `/SASJobExecution?_FILE=${appLoc}/services/web/gone.js`
      )

      expect(response.status).toBe(202)
      expect(await response.text()).toBe('Parameter Error\nFile error')
    })
  })
})

describe('the emulated Viya estate', () => {
  /** The status, the emulated stamp and the JSON body of one answer. */
  const read = async (response: Promise<Response> | undefined) => {
    expect(response).toBeDefined()
    const answer = await (response as Promise<Response>)

    return {
      status: answer.status,
      emulated: answer.headers.get('x-sasjs-emulated'),
      body: (await answer.json().catch(() => undefined)) as any
    }
  }

  it('answers the estate paths from the package, and says which contract', async () => {
    const worker = loadWorker()

    const answer = await read(worker.dispatch('/folders/folders/@item?path=/'))

    expect(answer.status).toBe(200)
    // the stamp is the package's: this host relays it rather than adding it
    expect(answer.emulated).toMatch(/^viya@/)
    expect(answer.body.type).toBe('folder')
  })

  it('creates a folder the SASjs routes can see, because there is one drive', async () => {
    const worker = loadWorker()

    const created = await read(
      worker.dispatch('/folders/folders?parentFolderUri=', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'viya-demo' })
      })
    )

    expect(created.status).toBe(201)
    expect(created.body.name).toBe('viya-demo')
    // the bodies name the account the page is signed in as, not a placeholder:
    // the same subject the SASjs routes resolve
    expect(created.body.createdBy).toBe('user-admin')

    // the id the estate handed out resolves, which is what a client stores
    const again = await read(
      worker.dispatch(`/folders/folders/${created.body.id}`)
    )
    expect(again.status).toBe(200)
    expect(again.body.id).toBe(created.body.id)

    // and the folder is a folder in the host's own drive: the SASjs route lists
    // it, so an app's two APIs see one filesystem here as they do on a server
    const sasjs = await read(
      worker.dispatch('/SASjsApi/drive/filetree?_folderPath=/viya-demo')
    )
    expect(sasjs.status).toBe(200)
    expect(JSON.stringify(sasjs.body)).toContain('viya-demo')
  })

  it('answers a refusal in the estate envelope, stamped like every other', async () => {
    const worker = loadWorker()

    const answer = await read(
      worker.dispatch('/folders/folders/@item?path=/not-there')
    )

    // a refusal is an answer, and carries the stamp, so an emulated 404 is never
    // read as evidence about a real estate
    expect(answer.status).toBe(404)
    expect(answer.emulated).toMatch(/^viya@/)
    expect(answer.body.httpStatusCode).toBe(404)
    expect(answer.body.version).toBe(2)
  })

  it('lands an uploaded file and its content in the drive, bytes and all', async () => {
    const worker = loadWorker()

    // the multipart part: the name the client sent and the bytes it sent
    const form = new FormData()
    form.append(
      'file',
      new Blob(['first content'], { type: 'text/plain' }),
      'notes.txt'
    )

    const uploaded = await read(
      worker.dispatch('/files/files?parentFolderUri=', {
        method: 'POST',
        body: form
      })
    )

    expect(uploaded.status).toBe(201)
    expect(uploaded.body.name).toBe('notes.txt')

    // a content PUT arrives as the body itself, not as JSON: the byte branch in
    // the transport, which a JSON-only transport would have parsed and broken
    const put = await read(
      worker.dispatch(`/files/files/${uploaded.body.id}/content`, {
        method: 'PUT',
        headers: { 'content-type': 'text/plain' },
        body: 'replaced content'
      })
    )
    expect(put.status).toBeLessThan(300)

    const fetched = await worker.dispatch(
      `/files/files/${uploaded.body.id}/content`
    )
    expect(await fetched!.text()).toBe('replaced content')
  })

  it('answers the current user with the account the page chose', async () => {
    const worker = loadWorker()

    const answer = await read(worker.dispatch('/identities/users/@currentUser'))

    expect(answer.status).toBe(200)
    expect(answer.body.id).toBe('user-admin')
  })

  it('routes the batch families to the emulator, which refuses them by name', async () => {
    const worker = loadWorker()

    // jobDefinitions, jobExecution and launcher are families in the package's
    // table, so they reach the emulator - the overlay has not implemented them,
    // and the emulator says so with a stamp and a reason. Left to the static
    // host they would answer with `index.html`, which a client parses as JSON.
    const launcher = await read(worker.dispatch('/launcher/contexts'))
    expect(launcher.emulated).toMatch(/^viya@/)
    expect(launcher.status).toBe(501)
    expect(String(launcher.body.message)).toMatch(/not emulated/)

    // mixed case in the family name: `/jobExecution`, not `/jobexecution`
    const job = await read(worker.dispatch('/jobExecution/jobs/not-a-job'))
    expect(job.emulated).toMatch(/^viya@/)
    expect(job.status).toBe(501)
    expect(String(job.body.message)).toMatch(/not emulated/)
  })

  it('seeds from the address as the package reads it, so one origin is one estate', async () => {
    // the seed is the address normalised to scheme, host and port: `viya/seed.ts`
    // drops the path, so two mounts on one origin are one estate's generated
    // data. The sites stay apart through the drive each persists - `persist.js`
    // opens `sasjs-mock-host:<mount>` - and this case pins the boundary, so a
    // package change that made the path significant is a decision, not a drift.
    const serverId = async (base: string) => {
      const worker = loadWorker(base)

      const contexts = await read(worker.dispatch('/compute/contexts'))
      const contextId = contexts.body.items[0].id

      const answer = await read(
        worker.dispatch(`/compute/contexts/${contextId}/sessions`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name: 'seeded' })
        })
      )

      expect(answer.status).toBe(201)

      return answer.body.serverId
    }

    expect(await serverId('/site-b')).toBe(await serverId('/site-a'))
  })

  it('takes the token endpoint here, so a client reads a refusal and not HTML', async () => {
    const worker = loadWorker()

    const answer = await read(
      worker.dispatch('/SASLogon/oauth/token', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: 'grant_type=password'
      })
    )

    // stamped, so a client knows which contract answered: the host owns the token
    // port, and a bare grant is refused for want of a client id. The answer is
    // never the SASjs route table's 404 or the static host's HTML.
    expect(answer.emulated).toMatch(/^viya@/)
    expect(answer.status).toBe(401)
    expect(answer.body.error).toBe('invalid_client')

    // the same address with a trailing slash is the same path: `routeRequest`
    // strips it before any lookup, so a client that adds one is not answered by
    // a different contract
    const slashed = await read(
      worker.dispatch('/SASLogon/oauth/token/', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: 'grant_type=password'
      })
    )
    expect(slashed.status).toBe(answer.status)
    expect(slashed.emulated).toMatch(/^viya@/)
  })

  it('costs no drive write to refuse an estate call, and one to accept it', async () => {
    const worker = loadWorker()
    const messages: any[] = []
    ;(global as any).__mockHostClients = [
      { postMessage: (m: any) => messages.push(m) }
    ]

    const persists = () =>
      messages.filter((m) => m.type === 'sasjs-persist').length

    // a refusal changed nothing, so nothing is written back: a client that polls
    // a route the emulator refuses must not cost a drive write per poll
    const refused = await read(
      worker.dispatch('/SASLogon/oauth/token', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: 'grant_type=password'
      })
    )
    expect(refused.status).toBeGreaterThanOrEqual(400)
    expect(persists()).toBe(0)

    // and an accepted write is persisted, or the next page load would lose it
    const created = await read(
      worker.dispatch('/folders/folders?parentFolderUri=', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'written-back' })
      })
    )
    expect(created.status).toBe(201)
    expect(persists()).toBeGreaterThan(0)
  })

  it('answers a no-content estate call with no body at all', async () => {
    const worker = loadWorker()

    const contexts = await read(worker.dispatch('/compute/contexts'))
    const created = await read(
      worker.dispatch(
        `/compute/contexts/${contexts.body.items[0].id}/sessions`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name: 'gone' })
        }
      )
    )

    // 204 has no body: the transport must not serialise one, or the response
    // constructor refuses it
    const response = await worker.dispatch(
      `/compute/sessions/${created.body.id}`,
      { method: 'DELETE' }
    )
    expect(response!.status).toBe(204)
    expect(await response!.text()).toBe('')
  })

  it('leaves every other path to the static host', async () => {
    const worker = loadWorker()

    // no respondWith: the fetch listener only takes the estate's prefixes, the
    // API's, the web tier's and the app stream's
    expect(worker.dispatch('/notes/not-an-api')).toBeUndefined()
  })
})

describe('the estate surface and the host', () => {
  const swSource = () =>
    fs.readFileSync(path.join(__dirname, '..', 'assets', 'sw.js'), 'utf8')

  it('keeps the estate families clear of every tier the host serves', () => {
    // the estate's prefixes are derived from the table, so a family the package
    // gains is answered - but a family whose first segment is a tier this host
    // already serves must not be taken from it. `/SASLogon` is the overlap that
    // exists today, and the token endpoint is named separately for it.
    const tiers = (
      swSource().match(/const TIER_PATHS =\s*\/\^\\\/\(([^)]+)\)/)![1] as string
    )
      .split('|')
      .map((tier) => tier.toLowerCase())

    const families = [
      ...new Set(
        VIYA_TABLE.map((route: any) =>
          route.path.split('/').filter(Boolean)[0].toLowerCase()
        )
      )
    ]

    expect(families.filter((family) => tiers.includes(family))).toEqual([
      'saslogon'
    ])
  })

  it("names the two special paths by the table's own operations", () => {
    // the byte and multipart branches match through the table's route templates,
    // so these ids are what they depend on: a rename in the package fails here
    // rather than turning them into predicates that never match
    const ids = VIYA_TABLE.map((route: any) => route.id)

    expect(ids).toContain('POST /files/files')
    expect(ids).toContain('PUT /files/files/{}/content')
  })
})

describe('the estate sign-in', () => {
  const basic = (id: string, secret: string) =>
    `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`

  /** The code the authorize step redirects with. */
  const authorize = async (
    worker: any,
    query = 'client_id=web_app&response_type=code&state=abc'
  ) => {
    const response = await worker.dispatch(`/SASLogon/oauth/authorize?${query}`)
    expect(response).toBeDefined()

    const answer = await (response as Promise<Response>)
    const location = new URL(answer.headers.get('location') as string)

    return { answer, location, code: location.searchParams.get('code') }
  }

  const exchange = async (
    worker: any,
    body: Record<string, string>,
    id = 'web_app',
    secret = 'web_app'
  ) =>
    worker.dispatch('/SASLogon/oauth/token', {
      method: 'POST',
      headers: {
        authorization: basic(id, secret),
        'content-type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams(body).toString()
    })

  const json = async (response: Promise<Response> | undefined) => {
    const answer = await (response as Promise<Response>)
    return {
      status: answer.status,
      emulated: answer.headers.get('x-sasjs-emulated'),
      body: (await answer.json().catch(() => undefined)) as any
    }
  }

  const currentUser = (worker: any, token: string) =>
    json(
      worker.dispatch('/identities/users/@currentUser', {
        headers: { authorization: `Bearer ${token}` }
      })
    )

  it('redirects the authorize step back to this site, carrying the code', async () => {
    const worker = loadWorker()

    // a client that asks for somewhere else is answered with the site's own
    // address: the registered redirect is where the app reads its code, and
    // honouring the query would make this an open redirect
    const { answer, location, code } = await authorize(
      worker,
      `client_id=web_app&response_type=code&state=abc&redirect_uri=${encodeURIComponent(
        'https://evil.test/'
      )}`
    )

    expect(answer.status).toBe(302)
    expect(location.origin).not.toBe('https://evil.test')
    expect(location.pathname).toBe('/')
    expect(code).toMatch(/^code-/)
    // state survives the round trip, which is what stops a cross-site request
    // being mistaken for this one
    expect(location.searchParams.get('state')).toBe('abc')
    expect(answer.headers.get('x-sasjs-emulated')).toMatch(/^viya@/)
  })

  it('exchanges a code for a pair, and the access token names the caller', async () => {
    const worker = loadWorker()

    const { code } = await authorize(worker)
    const token = await json(
      exchange(worker, {
        grant_type: 'authorization_code',
        code: code as string
      })
    )

    expect(token.status).toBe(200)
    expect(token.body.token_type).toBe('bearer')
    expect(token.body.access_token).toMatch(/^access-/)
    expect(token.body.refresh_token).toMatch(/^refresh-/)
    expect(token.body.expires_in).toBeGreaterThan(0)

    // the token is the estate's identity: the same call names the account the
    // code was issued for
    const user = await currentUser(worker, token.body.access_token)
    expect(user.status).toBe(200)
    expect(user.body.id).toBe('user-admin')
  })

  it('buys a pair with a password, and the estate answers as that account', async () => {
    const worker = loadWorker()

    const token = await json(
      exchange(worker, {
        grant_type: 'password',
        username: 'sasjsuser',
        password: 'Orion123'
      })
    )

    expect(token.status).toBe(200)

    const user = await currentUser(worker, token.body.access_token)
    expect(user.body.id).toBe('user-restricted')
  })

  it('rotates the pair from a refresh token', async () => {
    const worker = loadWorker()

    const { code } = await authorize(worker)
    const first = await json(
      exchange(worker, {
        grant_type: 'authorization_code',
        code: code as string
      })
    )

    const second = await json(
      exchange(worker, {
        grant_type: 'refresh_token',
        refresh_token: first.body.refresh_token
      })
    )

    expect(second.status).toBe(200)
    expect(second.body.access_token).not.toBe(first.body.access_token)

    const user = await currentUser(worker, second.body.access_token)
    expect(user.body.id).toBe('user-admin')
  })

  it('refuses an implicit-flow request by name, rather than redirecting a code', async () => {
    const worker = loadWorker()

    // a client asking for a token in the URL would otherwise be redirected with a
    // code it never asked for and fail with no diagnostic
    const answer = await json(
      worker.dispatch(
        '/SASLogon/oauth/authorize?client_id=web_app&response_type=token'
      )
    )

    expect(answer.status).toBe(400)
    expect(answer.body.error).toBe('unsupported_response_type')
    expect(answer.emulated).toMatch(/^viya@/)
  })

  it('redirects to the site it is served from, base path included', async () => {
    // a build served below the origin root has its own address: a code sent to
    // the origin root would land outside the app that asked for it
    const worker = loadWorker('/site-a')

    const response = await worker.dispatch(
      '/SASLogon/oauth/authorize?client_id=web_app&response_type=code'
    )
    const location = new URL(response!.headers.get('location') as string)

    expect(response!.status).toBe(302)
    expect(location.pathname.startsWith('/site-a/')).toBe(true)
  })

  it('answers a JSON body it cannot read as invalid_request', async () => {
    const worker = loadWorker()

    // both encodings answer the same way: the body is the caller's problem, and
    // the answer names it rather than pretending the form was empty
    const response = await worker.dispatch('/SASLogon/oauth/token', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not json at all'
    })

    expect(response!.status).toBe(400)
    expect((await response!.json()).error).toBe('invalid_request')
  })

  it('refuses a client that is not registered, and a wrong secret', async () => {
    const worker = loadWorker()

    const unknown = await json(
      exchange(
        worker,
        {
          grant_type: 'password',
          username: 'sasjsadmin',
          password: 'Orion123'
        },
        'nope',
        'nope'
      )
    )
    expect(unknown.status).toBe(401)
    expect(unknown.body.error).toBe('invalid_client')

    const wrong = await json(
      exchange(
        worker,
        {
          grant_type: 'password',
          username: 'sasjsadmin',
          password: 'Orion123'
        },
        'web_app',
        'wrong'
      )
    )
    expect(wrong.status).toBe(401)
    expect(wrong.body.error).toBe('invalid_client')
  })

  it('challenges a failed client authentication, as RFC 6749 asks', async () => {
    const worker = loadWorker()

    // a client that waits for a challenge before retrying with credentials has
    // only the header to go on: a bare 401 reads as fatal
    const answer = await exchange(
      worker,
      { grant_type: 'password', username: 'sasjsadmin', password: 'Orion123' },
      'web_app',
      'wrong'
    )

    expect(answer!.status).toBe(401)
    expect(answer!.headers.get('www-authenticate')).toBe(
      'Basic realm="SASLogon"'
    )
  })

  it('refuses a JSON body that is not a form, naming the request', async () => {
    const worker = loadWorker()

    // `null` parses as valid JSON and is not an object: reading fields off it
    // would throw out of the handler, which is the answer this rules out
    const response = await worker.dispatch('/SASLogon/oauth/token', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'null'
    })

    expect(response!.status).toBe(400)
    expect((await response!.json()).error).toBe('invalid_request')
  })

  it('refuses a grant it does not answer, by name', async () => {
    const worker = loadWorker()

    const answer = await json(
      exchange(worker, { grant_type: 'client_credentials' })
    )

    expect(answer.status).toBe(400)
    expect(answer.body.error).toBe('unsupported_grant_type')
    expect(String(answer.body.error_description)).toContain('password')
  })

  it('reads a client that posts its credentials in the body as JSON', async () => {
    const worker = loadWorker()

    // no Basic header and no form encoding: the fields are the request
    const answer = await json(
      worker.dispatch('/SASLogon/oauth/token', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'password',
          client_id: 'web_app',
          client_secret: 'web_app',
          username: 'sasjsadmin',
          password: 'Orion123'
        })
      })
    )

    expect(answer.status).toBe(200)
    expect(answer.body.access_token).toMatch(/^access-/)
  })

  it('refuses an authorize step with no client, and a token with no client id', async () => {
    const worker = loadWorker()

    const noClient = await json(
      worker.dispatch('/SASLogon/oauth/authorize?response_type=code')
    )
    expect(noClient.status).toBe(403)
    expect(noClient.emulated).toMatch(/^viya@/)
    expect(noClient.body.error).toBe('invalid_client')

    const bare = await json(
      worker.dispatch('/SASLogon/oauth/token', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: 'grant_type=password'
      })
    )
    expect(bare.status).toBe(401)
    expect(bare.body.error).toBe('invalid_client')
    expect(String(bare.body.error_description)).toContain(
      'client id is required'
    )
  })

  it('refuses a code it did not issue, and a password that does not verify', async () => {
    const worker = loadWorker()

    const forged = await json(
      exchange(worker, {
        grant_type: 'authorization_code',
        code: 'code-not-issued'
      })
    )
    expect(forged.status).toBe(401)
    expect(forged.body.error).toBe('invalid_grant')

    const wrong = await json(
      exchange(worker, {
        grant_type: 'password',
        username: 'sasjsadmin',
        password: 'nope'
      })
    )
    expect(wrong.status).toBe(401)
    expect(wrong.body.error).toBe('invalid_grant')
  })

  it('takes a request with no content type at all, and a grant with no fields', async () => {
    const worker = loadWorker()

    // no header: the body is read as JSON rather than refused for its type
    const bare = await json(
      worker.dispatch('/SASLogon/oauth/token', {
        method: 'POST',
        body: JSON.stringify({
          grant_type: 'password',
          client_id: 'web_app',
          client_secret: 'web_app',
          username: 'sasjsadmin',
          password: 'Orion123'
        })
      })
    )
    expect(bare.status).toBe(200)

    // a password grant with nothing filled in: the login refuses before any
    // token is minted
    const empty = await json(exchange(worker, { grant_type: 'password' }))
    expect(empty.status).toBe(401)
    expect(empty.body.error).toBe('invalid_grant')
  })

  it('refuses a sign-in when no account is signed in', async () => {
    const worker = loadWorker('', { skipLint: true })
    const boot = worker.message({ type: 'sasjs-seed', subject: null })
    await boot.pending
    expect(boot.replies[0].error).toBeUndefined()

    // no caller, no code: the authorize step is a signed-in caller's step
    const response = await worker.dispatch(
      '/SASLogon/oauth/authorize?client_id=web_app&response_type=code'
    )

    expect(response!.status).toBe(401)
  })

  it('reads past a malformed Basic header instead of dying on it', async () => {
    const worker = loadWorker()

    // not base64: the decode throws, and the request must still be answered -
    // with the body's credentials, which are the ones a client that cannot spell
    // its header has left
    const answer = await json(
      worker.dispatch('/SASLogon/oauth/token', {
        method: 'POST',
        headers: {
          authorization: 'Basic not-base64-at-all',
          'content-type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          grant_type: 'password',
          client_id: 'web_app',
          client_secret: 'web_app',
          username: 'sasjsadmin',
          password: 'Orion123'
        }).toString()
      })
    )

    expect(answer.status).toBe(200)
    expect(answer.body.access_token).toMatch(/^access-/)
  })

  it('decodes a Basic credential the way RFC 6749 encodes it', async () => {
    const worker = loadWorker('', { skipLint: true })
    const secret = 's3cr:et%&'
    const identity = {
      ...DEFAULT_IDENTITY,
      clients: DEFAULT_IDENTITY.clients.map((client: any) =>
        client.clientId === 'web_app'
          ? { ...client, clientSecret: secret }
          : client
      )
    }
    const boot = worker.message({
      type: 'sasjs-seed',
      identity,
      subject: 'sasjsadmin'
    })
    await boot.pending
    expect(boot.replies[0].error).toBeUndefined()

    // section 2.3.1: each half is form-encoded before it is base64'd, so a
    // secret carrying `:` `%` or `&` must compare equal to what it encodes to
    const answer = await json(
      worker.dispatch('/SASLogon/oauth/token', {
        method: 'POST',
        headers: {
          authorization: `Basic ${Buffer.from(
            `web_app:${encodeURIComponent(secret)}`
          ).toString('base64')}`,
          'content-type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          grant_type: 'password',
          username: 'sasjsadmin',
          password: 'Orion123'
        }).toString()
      })
    )

    expect(answer.status).toBe(200)
    expect(answer.body.access_token).toMatch(/^access-/)
  })

  it('decodes a space in a Basic credential as a form would', async () => {
    const worker = loadWorker('', { skipLint: true })
    const secret = 'two words'
    const identity = {
      ...DEFAULT_IDENTITY,
      clients: DEFAULT_IDENTITY.clients.map((client: any) =>
        client.clientId === 'web_app'
          ? { ...client, clientSecret: secret }
          : client
      )
    }
    const boot = worker.message({
      type: 'sasjs-seed',
      identity,
      subject: 'sasjsadmin'
    })
    await boot.pending
    expect(boot.replies[0].error).toBeUndefined()

    // form encoding sends a space as `+`, which `decodeURIComponent` alone leaves
    // in place: a client whose secret has a space would be refused
    const answer = await json(
      worker.dispatch('/SASLogon/oauth/token', {
        method: 'POST',
        headers: {
          authorization: `Basic ${Buffer.from(
            `web_app:${encodeURIComponent(secret).replace(/%20/g, '+')}`
          ).toString('base64')}`,
          'content-type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          grant_type: 'password',
          username: 'sasjsadmin',
          password: 'Orion123'
        }).toString()
      })
    )

    expect(answer.status).toBe(200)
  })

  it('refuses a client whose secret the fixture does not declare', async () => {
    const worker = loadWorker('', { skipLint: true })
    const identity = {
      ...DEFAULT_IDENTITY,
      clients: DEFAULT_IDENTITY.clients.map(
        ({ clientSecret, ...client }: any) => client
      )
    }
    const boot = worker.message({
      type: 'sasjs-seed',
      identity,
      subject: 'sasjsadmin'
    })
    await boot.pending
    expect(boot.replies[0].error).toBeUndefined()

    const answer = await json(
      exchange(worker, {
        grant_type: 'password',
        username: 'sasjsadmin',
        password: 'Orion123'
      })
    )

    // a secret that cannot be verified is refused by name, never accepted: the
    // check cannot become a no-op without an answer like this one
    expect(answer.status).toBe(401)
    expect(answer.body.error).toBe('invalid_client')
    expect(String(answer.body.error_description)).toContain(
      'declares no secret'
    )
  })

  it('answers a body it cannot read as invalid_request, not as a crash', async () => {
    const worker = loadWorker()

    // a body stream that fails mid-read: the handler must answer an OAuth error,
    // because a sign-in that dies as a network error tells the client nothing
    const body = new ReadableStream({
      start(controller) {
        controller.error(new Error('the body failed'))
      }
    })

    const response = await worker.dispatch('/SASLogon/oauth/token', {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        authorization: `Basic ${Buffer.from('web_app:web_app').toString('base64')}`
      },
      body,
      duplex: 'half'
    })

    expect(response!.status).toBe(400)
    expect((await response!.json()).error).toBe('invalid_request')
  })

  it('refuses a bearer the store does not hold', async () => {
    const worker = loadWorker()

    // a token this host never issued is not a caller: the estate must refuse it
    // rather than fall back to the account the page is signed in as
    const answer = await currentUser(worker, 'access-not-a-real-token')

    expect(answer.status).toBe(401)
  })
})

describe('the sign-in page', () => {
  const form = (fields: Record<string, string>) => ({
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields).toString()
  })

  it('serves the page with the fields the estate asks for', async () => {
    const worker = loadWorker()

    const response = await worker.dispatch('/SASLogon/login?service=/app/')

    expect(response!.status).toBe(200)
    expect(response!.headers.get('content-type')).toContain('text/html')
    expect(response!.headers.get('x-sasjs-emulated')).toMatch(/^viya@/)

    const page = await response!.text()
    expect(page).toContain('name="username"')
    expect(page).toContain('name="password"')
    // the page says what the handoff means: the account travels in the address,
    // and an emulated estate protects nothing
    expect(page).toContain('carried in the address')
    // the service survives the round trip, escaped, so the post knows where to go
    expect(page).toContain('value="/app/"')
  })

  it('signs a form post in, and the redirect carries the account', async () => {
    const worker = loadWorker()

    const response = await worker.dispatch(
      '/SASLogon/login',
      form({ username: 'sasjsuser', password: 'Orion123' })
    )

    expect(response!.status).toBe(302)

    // a service worker is handed no cookies and cannot set one, so the account
    // travels in the address the page lands on and `persist.js` stores it
    const location = new URL(
      response!.headers.get('location') as string,
      'https://mock.example.com'
    )
    // the fragment: not sent in a Referer, and consumed on arrival
    expect(
      new URLSearchParams(location.hash.slice(1)).get('sasjs-caller')
    ).toBe('sasjsuser')
  })

  it('puts the form back with what went wrong', async () => {
    const worker = loadWorker()

    const response = await worker.dispatch(
      '/SASLogon/login',
      form({ username: 'sasjsadmin', password: 'nope' })
    )

    // a browser renders the page again rather than a blank 401
    expect(response!.status).toBe(200)
    expect(await response!.text()).toContain('Invalid Password.')
  })

  it('keeps the service through a refused password', async () => {
    const worker = loadWorker()

    // the service a form post carries is in the body, not the address: losing it
    // would put the caller on the site root after one wrong password
    const refused = await worker.dispatch(
      '/SASLogon/login',
      form({ username: 'sasjsadmin', password: 'nope', service: '/app/' })
    )
    expect(await refused!.text()).toContain('value="/app/"')

    const signedIn = await worker.dispatch(
      '/SASLogon/login',
      form({ username: 'sasjsadmin', password: 'Orion123', service: '/app/' })
    )
    expect(signedIn!.headers.get('location')).toBe(
      '/app/#sasjs-caller=sasjsadmin'
    )
  })

  it('sends the browser into this site, never to another origin', async () => {
    const worker = loadWorker('/site-a')

    const response = await worker.dispatch(
      '/SASLogon/login',
      form({
        username: 'sasjsadmin',
        password: 'Orion123',
        service: 'https://evil.test/x'
      })
    )

    expect(response!.status).toBe(302)
    // this site's root, with the account it just chose
    expect(response!.headers.get('location')).toBe(
      '/site-a/#sasjs-caller=sasjsadmin'
    )
  })

  it('posts into the site it is served from', async () => {
    // a build in a folder registers the worker for `<folder>/`, so an
    // origin-absolute form action would submit outside it and the page would be
    // inert
    const worker = loadWorker('/site-a')

    const page = await worker.dispatch('/SASLogon/login')
    expect(await page!.text()).toContain('action="/site-a/saslogon/login"')
  })

  it('refuses an account the fixture does not hold, rather than answering as the administrator', async () => {
    const worker = loadWorker()

    // a mistyped or shared sign-in link must not be answered as the
    // administrator: that hides the mistake behind a working site, and
    // `SASjsMock.as()` would report success for an account nothing knows. The
    // refusal is tagged so the page clears the account it stored and keeps the
    // fixture, which is fine.
    const boot = worker.message({ type: 'sasjs-seed', subject: 'gone-user' })
    await boot.pending

    expect(boot.replies[0].error).toContain("No account 'gone-user'")
    expect(boot.replies[0].errorKind).toBe('caller')

    // nothing was adopted: the worker still answers as the administrator, the
    // same answer a request with no session gets
    const answer = await worker.dispatch('/identities/users/@currentUser')
    expect((await answer!.json()).id).toBe('user-admin')
  })

  it('ends the session at the sign-out a browser follows', async () => {
    const worker = loadWorker()

    const signedIn = await worker.dispatch(
      '/SASLogon/login',
      form({ username: 'sasjsuser', password: 'Orion123' })
    )
    expect(signedIn!.status).toBe(302)

    const out = await worker.dispatch('/SASLogon/logout')

    // the body stays the package's - the corpus pins it - and the browser is sent
    // into the site by a header, where the page drops the session it owns
    expect(out!.status).toBe(200)
    expect(await out!.text()).toBe('OK!')
    expect(out!.headers.get('refresh')).toBe('0; url=/#sasjs-signout=1')

    // and the worker itself answers as the account the boot named
    const after = await worker.dispatch('/identities/users/@currentUser')
    expect((await after!.json()).id).toBe('user-admin')
  })
})
