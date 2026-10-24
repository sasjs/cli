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

  return { runtime, dispatch }
}

const runRequest = (body: any) => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body)
})

describe('service worker host', () => {
  afterEach(() => {
    delete (global as any).self
    delete (global as any).importScripts
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

  it('leaves requests outside /SASjsApi/ to the static host', () => {
    const { dispatch } = seeded()

    expect(dispatch('/index.html')).toBeUndefined()
  })
})
