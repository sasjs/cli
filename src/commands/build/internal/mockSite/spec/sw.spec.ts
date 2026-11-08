import path from 'path'
import { DRIVE_CORPUS } from '@sasjs/api'
import type { CorpusCase } from '@sasjs/api'

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

const loadWorker = () => {
  jest.resetModules()
  const handlers: { [type: string]: ((event: any) => any)[] } = {}
  let refusingWrites = false
  const self: any = {
    location: { origin },
    addEventListener: (type: string, fn: (event: any) => any) => {
      handlers[type] = handlers[type] || []
      handlers[type].push(fn)
    },
    skipWaiting: () => {},
    clients: { claim: () => {}, matchAll: async () => [] }
  }
  ;(global as any).self = self
  // sw.js imports the runtime and the package by URL; the test loads the same
  // files from source, so the worker here answers with the code the site ships.
  ;(global as any).importScripts = (path: string) => {
    if (path.includes('md5')) return
    if (path.includes('api-browser')) return require(apiBrowserBuild())
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
  ;(global as any).fetch = jest.fn(async (url: string) =>
    String(url).includes('vfs-seed')
      ? jsonResponse({
          files: {
            [drivePath('services/public/getdata.js')]: '_webout = "seeded";'
          }
        })
      : jsonResponse({ appLoc })
  )

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

  it('answers the session state, and names a route it does not implement', async () => {
    const { dispatch } = seeded()

    const session = await dispatch('/SASjsApi/session')
    expect(await session.json()).toEqual({ state: 'completed' })

    const unknown = await dispatch('/SASjsApi/unknown/route')
    expect(unknown.status).toBe(404)
    expect((await unknown.json()).message).toContain('Not implemented')
  })

  it('answers 404 for a drive file the drive does not hold', async () => {
    const { dispatch } = seeded()

    const response = await dispatch(
      '/SASjsApi/drive/file?_filePath=' + encodeURIComponent('/missing.txt')
    )

    expect(response.status).toBe(404)
    expect(await response.text()).toBe(`File doesn't exist.`)
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
    expect(await response.json()).toEqual({ message: '_program is required' })
  })

  it('answers 500 with the failure shape when the service throws', async () => {
    const { runtime, dispatch } = seeded()
    runtime.load({
      [drivePath('services/public/broken.js')]: 'throw new Error("boom")'
    })

    const response = await dispatch(
      '/SASjsApi/stp/execute?_program=' +
        encodeURIComponent(`${appLoc}/services/public/broken`)
    )
    const body = await response.json()

    expect(response.status).toBe(500)
    expect(body.status).toBe('failure')
    expect(body.error).toContain('boom')
  })

  it('runs code carried by a code/execute request', async () => {
    const { dispatch } = seeded()

    const response = await dispatch(
      '/SASjsApi/code/execute',
      runRequest({ code: '_webout = "inline";', params: {} })
    )

    expect(await response.text()).toBe('inline')
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
    // the documented body, field for field: `cors` is the document's CorsType,
    // and a property the document does not state is this host describing an
    // API the server does not serve
    expect(await info.json()).toEqual({
      mode: 'desktop',
      cors: 'disable',
      httpPort: null,
      httpsPort: null,
      runTimes: ['js'],
      authProviders: [],
      localLoginEnabled: true,
      version: 'browser host'
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
          expect(await response.text()).toBe(testCase.expect.error)
        }
        const want = testCase.expect.contents
        if (typeof want === 'string') expect(await response.text()).toBe(want)
        else if (want !== undefined)
          expect(new Uint8Array(await response.arrayBuffer())).toEqual(want)
      })
    }
  })
})
