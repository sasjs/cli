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

const loadWorker = () => {
  jest.resetModules()
  const handlers: { [type: string]: ((event: any) => any)[] } = {}
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
  // sw.js imports the runtime by URL; the test loads the same file from source.
  ;(global as any).importScripts = (path: string) => {
    if (path.includes('md5')) return
    require('../assets/runtime-core.js')
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

  return { runtime, dispatch, message, lifecycle, self }
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
    expect((await response.json()).message).toBe('File not found')
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
    expect((await response.json()).message).toContain('Corrupt binary entry')
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
    expect(await info.json()).toEqual(
      expect.objectContaining({ protocol: 'browser', runTimes: ['js'] })
    )

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
})
