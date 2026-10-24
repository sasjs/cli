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
    const request = new Request(origin + path, init)
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
