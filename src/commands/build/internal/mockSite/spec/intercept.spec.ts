export {}

/**
 * The page-side half of the request path: the adapter sends multipart XHRs, so
 * the bridge converts a request body to JSON for the worker and then makes the
 * XHR the app is holding behave like a real one. Both are tested here against
 * the file the site ships.
 */
type Listener = (event: any) => void

class FakeXHR {
  public listeners: { [type: string]: Listener[] } = {}
  public responseType = ''
  public status = 0
  public statusText = ''
  public readyState = 0
  public responseText = ''
  public response: any = null
  public sentWith: any = null
  public openedWith: any = null
  public nativeSendCount = 0

  open(method: string, url: string) {
    this.openedWith = { method, url }
  }

  send(body?: any) {
    // The bridge captures this as the "native" transport, so counting here is
    // how a test sees whether a request reached the real one or an interceptor.
    this.nativeSendCount++
    this.sentWith = body
  }

  addEventListener(type: string, fn: Listener) {
    this.listeners[type] = this.listeners[type] || []
    this.listeners[type].push(fn)
  }

  dispatchEvent(event: any) {
    ;(this.listeners[event.type] || []).forEach((fn) => fn(event))
    return true
  }

  getAllResponseHeaders() {
    return ''
  }

  getResponseHeader(_key: string) {
    return null
  }
}

const loadBridge = (fetchImpl: jest.Mock) => {
  jest.resetModules()
  // A fresh subclass per load: the bridge patches XMLHttpRequest.prototype, so
  // reusing one class would leave the previous bridge's wrapper in place as the
  // "native" transport it captures, and stack an interceptor per load.
  const XHR = class extends FakeXHR {}
  const window: any = {}
  ;(global as any).window = window
  ;(global as any).localStorage = { getItem: () => null }
  ;(global as any).XMLHttpRequest = XHR
  ;(global as any).Event = class {
    constructor(public type: string) {}
  }
  ;(global as any).ProgressEvent = class {
    constructor(public type: string) {}
  }
  ;(global as any).fetch = fetchImpl
  require('../assets/intercept.js')
  return { window, XHR }
}

const jsonResponse = (body: any, status = 200) =>
  new Response(body, {
    status,
    headers: { 'content-type': 'application/json' }
  })

const run = async (xhr: any, method: string, url: string, body?: any) => {
  const loaded = new Promise((resolve) => xhr.addEventListener('load', resolve))
  xhr.open(method, url)
  xhr.send(body)
  await loaded
}

describe('page-side bridge', () => {
  afterEach(() => {
    delete (global as any).window
    delete (global as any).localStorage
    delete (global as any).XMLHttpRequest
    delete (global as any).fetch
  })

  it('leaves a request outside the SASjs API to the native transport', async () => {
    const fetchImpl = jest.fn()
    const { XHR } = loadBridge(fetchImpl)

    const xhr = new XHR()
    xhr.open('GET', '/api/health')
    xhr.send()

    expect(xhr.sentWith).toBeUndefined()
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('converts a multipart body to JSON and replays the response onto the XHR', async () => {
    const fetchImpl = jest.fn(async () => jsonResponse('{"status":"success"}'))
    const { XHR } = loadBridge(fetchImpl)

    const form = new FormData()
    form.append('_program', '/Public/app/test/services/public/getdata')
    form.append(
      'table1',
      new Blob(['a,b\n1,2\n'], { type: 'text/csv' }),
      'data.csv'
    )

    const xhr = new XHR()
    await run(xhr, 'POST', '/SASjsApi/stp/execute', form)

    const [, init] = fetchImpl.mock.calls[0] as any
    expect(init.method).toBe('POST')
    expect(init.headers['content-type']).toBe('application/json')
    expect(JSON.parse(init.body)).toEqual({
      params: { _program: '/Public/app/test/services/public/getdata' },
      tables: [{ name: 'table1', filename: 'data.csv', csv: 'a,b\n1,2\n' }]
    })
    expect(xhr.status).toBe(200)
    expect(xhr.readyState).toBe(4)
    expect(xhr.responseText).toBe('{"status":"success"}')
  })

  it('parses the response when the app asked for json', async () => {
    const { XHR } = loadBridge(jest.fn(async () => jsonResponse('{"a":1}')))
    const xhr = new XHR()
    xhr.responseType = 'json'

    await run(xhr, 'GET', '/SASjsApi/info')

    expect(xhr.response).toEqual({ a: 1 })
  })

  it('answers with a 500 body when the request itself fails', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation()
    const { XHR } = loadBridge(
      jest.fn(async () => Promise.reject(new Error('worker died')))
    )

    const xhr = new XHR()
    await run(xhr, 'GET', '/SASjsApi/info')

    expect(xhr.status).toBe(500)
    expect(JSON.parse(xhr.responseText)).toEqual({
      message: 'worker died',
      error: 'worker died'
    })
    consoleError.mockRestore()
  })

  it('gives each load a fresh prototype, so a request traverses one interceptor', () => {
    const first = loadBridge(jest.fn())
    const second = loadBridge(jest.fn())

    // The bridge patches XMLHttpRequest.prototype and captures what it found
    // there as the native transport. Loading into a class that is already
    // patched would make the second load's "native" the first load's wrapper.
    expect(second.XHR.prototype).not.toBe(first.XHR.prototype)
    expect(Object.getPrototypeOf(second.XHR.prototype)).toBe(FakeXHR.prototype)

    const xhr = new second.XHR()
    xhr.open('GET', '/api/health')
    xhr.send()

    expect(xhr.nativeSendCount).toBe(1)
  })
})
