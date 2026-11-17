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
  public requestHeaders: { [name: string]: string } = {}

  open(method: string, url: string) {
    if (method === 'INVALID') throw new Error('invalid method')
    this.openedWith = { method, url }
    this.requestHeaders = {}
    this.readyState = 1
    this.dispatchEvent({ type: 'readystatechange' })
  }

  setRequestHeader(name: string, value: string) {
    this.requestHeaders[name.toLowerCase()] = value
  }

  abort() {
    this.readyState = 0
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

  removeEventListener(type: string, fn: Listener) {
    this.listeners[type] = (this.listeners[type] || []).filter(
      (listener) => listener !== fn
    )
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
  const window: any = {
    location: {
      href: 'https://app.example/index.html',
      origin: 'https://app.example'
    }
  }
  ;(global as any).window = window
  ;(global as any).document = { baseURI: window.location.href }
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
    delete (global as any).document
    delete (global as any).localStorage
    delete (global as any).XMLHttpRequest
    delete (global as any).fetch
  })

  it('leaves a request outside the SASjs API to the native transport', async () => {
    const fetchImpl = jest.fn()
    const { XHR } = loadBridge(fetchImpl)

    const xhr = new XHR()
    xhr.open('GET', '/health')
    xhr.send()

    expect(xhr.sentWith).toBeUndefined()
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('does not send a pending token to a reopened cross-origin URL', async () => {
    const fetchImpl = jest.fn(async () => jsonResponse('{}'))
    const { XHR } = loadBridge(fetchImpl)
    const xhr = new XHR()
    xhr.open('POST', '/api/info')
    xhr.setRequestHeader('Authorization', 'Bearer secret')
    xhr.send('{}')
    xhr.open('POST', 'https://evil.example/api/steal')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('honors abort while conversion is pending', async () => {
    const fetchImpl = jest.fn(async () => jsonResponse('{}'))
    const { XHR } = loadBridge(fetchImpl)
    const xhr = new XHR()
    xhr.open('POST', '/api/info')
    xhr.setRequestHeader('Authorization', 'Bearer secret')
    xhr.send('{}')
    xhr.abort()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('rejects send after abort with a native InvalidStateError', () => {
    const { XHR } = loadBridge(jest.fn(async () => jsonResponse('{}')))
    const xhr = new XHR()
    xhr.open('POST', '/api/info')
    xhr.send('{}')
    xhr.abort()
    expect(() => xhr.send('{}')).toThrow(
      expect.objectContaining({ name: 'InvalidStateError' })
    )
  })

  it('cancels the fetch when a bridged request is aborted', async () => {
    const fetchImpl = jest.fn(async (_url: string, init: any) => {
      await new Promise<void>((resolve) =>
        init.signal.addEventListener('abort', resolve)
      )
      throw new Error('aborted')
    })
    const { XHR } = loadBridge(fetchImpl)
    const xhr = new XHR()
    xhr.open('GET', '/api/info')
    xhr.send()
    await new Promise((resolve) => setTimeout(resolve, 0))
    const signal = (fetchImpl.mock.calls[0] as any)[1].signal
    xhr.abort()
    expect(signal.aborted).toBe(true)
  })

  it('freezes the resolved URL before asynchronous conversion', async () => {
    const fetchImpl = jest.fn(async () => jsonResponse('{}'))
    const { XHR } = loadBridge(fetchImpl)
    const xhr = new XHR()
    xhr.open('POST', '/api/info')
    xhr.setRequestHeader('Authorization', 'Bearer secret')
    xhr.send('{}')
    ;(global as any).document.baseURI = 'https://evil.example/'
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect((fetchImpl.mock.calls[0] as any)[0]).toBe(
      'https://app.example/api/info'
    )
  })

  it('leaves cross-origin API requests to native XHR', () => {
    const fetchImpl = jest.fn()
    const { XHR } = loadBridge(fetchImpl)
    const xhr = new XHR()
    xhr.open('GET', 'https://evil.example/api/steal')
    xhr.setRequestHeader('Authorization', 'Bearer explicit')
    xhr.send()
    expect(xhr.nativeSendCount).toBe(1)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('rejects a second send synchronously', () => {
    const { XHR } = loadBridge(jest.fn(async () => jsonResponse('{}')))
    const xhr = new XHR()
    xhr.open('POST', '/api/info')
    xhr.send('{}')
    expect(() => xhr.send('{}')).toThrow(
      expect.objectContaining({ name: 'InvalidStateError' })
    )
  })

  it('rejects setting a header after bridged send', () => {
    const { XHR } = loadBridge(jest.fn(async () => jsonResponse('{}')))
    const xhr = new XHR()
    xhr.open('GET', '/api/info')
    xhr.send()
    expect(() => xhr.setRequestHeader('Authorization', 'Bearer late')).toThrow(
      expect.objectContaining({ name: 'InvalidStateError' })
    )
  })

  it('preserves the completed response when reopening fails', async () => {
    const { XHR } = loadBridge(jest.fn(async () => jsonResponse('{}')))
    const xhr = new XHR()
    await run(xhr, 'GET', '/api/info')
    expect(() => xhr.open('INVALID', '/api/info')).toThrow()
    expect(xhr.status).toBe(200)
    expect(xhr.readyState).toBe(4)
    expect(xhr.responseText).toBe('{}')
  })

  it('clears a completed response on abort and can be reused', async () => {
    const fetchImpl = jest.fn(async () => jsonResponse('{"value":1}'))
    const { XHR } = loadBridge(fetchImpl)
    const xhr = new XHR()
    await run(xhr, 'GET', '/api/info')
    expect(xhr.getResponseHeader('content-type')).toBe('application/json')
    expect(xhr.getAllResponseHeaders()).toContain('application/json')

    xhr.abort()
    expect(xhr.readyState).toBe(0)
    expect(xhr.status).toBe(0)
    expect(xhr.responseText).toBe('')
    expect(xhr.getResponseHeader('content-type')).toBeNull()
    expect(xhr.getAllResponseHeaders()).toBe('')

    await run(xhr, 'GET', '/api/other')
    expect(xhr.status).toBe(200)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('resets state before abort events when abort is called again at DONE', () => {
    const { XHR } = loadBridge(jest.fn())
    const xhr = new XHR()
    const events: string[] = []
    xhr.addEventListener('readystatechange', () => {
      if (xhr.readyState === 4) {
        events.push('done:4')
        xhr.abort()
      }
    })
    xhr.addEventListener('abort', () => events.push(`abort:${xhr.readyState}`))
    xhr.addEventListener('loadend', () =>
      events.push(`loadend:${xhr.readyState}`)
    )
    xhr.open('GET', '/api/info')
    xhr.send()
    xhr.abort()
    expect(events).toEqual(['done:4', 'abort:0', 'loadend:0'])
    expect(xhr.readyState).toBe(0)
  })

  it('preserves an aborted state when reopening with an invalid method fails', () => {
    const { XHR } = loadBridge(jest.fn())
    const xhr = new XHR()
    xhr.open('GET', '/api/info')
    xhr.send()
    xhr.abort()
    expect(() => xhr.open('INVALID', '/api/other')).toThrow('invalid method')
    expect(xhr.readyState).toBe(0)
    expect(() => xhr.send()).toThrow(
      expect.objectContaining({ name: 'InvalidStateError' })
    )
    xhr.open('GET', '/api/other')
    expect(xhr.readyState).toBe(1)
  })

  it('stops the old loadend event when load reopens the XHR', async () => {
    const { XHR } = loadBridge(jest.fn(async () => jsonResponse('{}')))
    const xhr = new XHR()
    const loadends = jest.fn()
    xhr.addEventListener('load', () => xhr.open('GET', '/health'))
    xhr.addEventListener('loadend', loadends)
    xhr.open('GET', '/api/info')
    xhr.send()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(xhr.readyState).toBe(1)
    expect(loadends).not.toHaveBeenCalled()
  })

  it('clears synthetic response state before native open events on reuse', async () => {
    const { XHR } = loadBridge(jest.fn(async () => jsonResponse('{}')))
    const xhr = new XHR()
    await run(xhr, 'GET', '/api/info')
    const states: number[] = []
    xhr.addEventListener('readystatechange', () => states.push(xhr.readyState))
    xhr.open('GET', '/api/other')
    expect(states).toEqual([1])
    expect(xhr.status).toBe(0)
  })

  it('stops old response events if readystatechange reopens the XHR', async () => {
    const { XHR } = loadBridge(jest.fn(async () => jsonResponse('{}')))
    const xhr = new XHR()
    const loads = jest.fn()
    xhr.addEventListener('load', loads)
    xhr.addEventListener('readystatechange', () => {
      if (xhr.readyState === 4) xhr.open('GET', '/health')
    })
    xhr.open('GET', '/api/info')
    xhr.send()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(loads).not.toHaveBeenCalled()
  })

  it('does not dispatch a stale response after the XHR is reopened', async () => {
    let resolveFetch: any
    const fetchImpl = jest.fn(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve
        })
    )
    const { XHR } = loadBridge(fetchImpl)
    const xhr = new XHR()
    const loads = jest.fn()
    xhr.addEventListener('load', loads)
    xhr.open('GET', '/api/info')
    xhr.send()
    await new Promise((resolve) => setTimeout(resolve, 0))
    xhr.open('GET', '/health')
    resolveFetch(jsonResponse('{}'))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(loads).not.toHaveBeenCalled()
    expect(xhr.readyState).toBe(1)
  })

  it('normalizes HTTP whitespace on repeated authorization values', async () => {
    const fetchImpl = jest.fn(async () => jsonResponse('{}'))
    const { XHR } = loadBridge(fetchImpl)
    const xhr = new XHR()
    xhr.open('GET', '/api/info')
    xhr.setRequestHeader('Authorization', ' \tBearer first\t ')
    xhr.setRequestHeader('authorization', '\tBearer second ')
    xhr.send()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect((fetchImpl.mock.calls[0] as any)[1].headers.authorization).toBe(
      'Bearer first, Bearer second'
    )
  })

  it('retains authorization set by the native open event listener', async () => {
    const fetchImpl = jest.fn(async () => jsonResponse('{}'))
    const { XHR } = loadBridge(fetchImpl)
    const xhr = new XHR()
    xhr.addEventListener('readystatechange', () => {
      if (xhr.readyState === 1)
        xhr.setRequestHeader('Authorization', 'Bearer event')
    })
    await run(xhr, 'GET', '/api/info')
    expect((fetchImpl.mock.calls[0] as any)[1].headers.authorization).toBe(
      'Bearer event'
    )
  })

  it('forwards only authorization while keeping the converted body type', async () => {
    const fetchImpl = jest.fn(async () => jsonResponse('{}'))
    const { XHR } = loadBridge(fetchImpl)
    const xhr = new XHR()
    const loaded = new Promise((resolve) =>
      xhr.addEventListener('load', resolve)
    )
    xhr.open('POST', '/api/drive/file')
    xhr.setRequestHeader('Content-Type', 'multipart/form-data; boundary=old')
    xhr.setRequestHeader('X-Unrelated', 'not forwarded')
    xhr.setRequestHeader('aUtHoRiZaTiOn', 'Bearer test')
    xhr.send(new FormData())
    await loaded
    const [, init] = fetchImpl.mock.calls[0] as any
    expect(init.headers).toEqual({
      accept: '*/*',
      authorization: 'Bearer test',
      'content-type': 'application/json'
    })
  })

  it('clears authorization when an XHR is reopened', async () => {
    const fetchImpl = jest.fn(async () => jsonResponse('{}'))
    const { XHR } = loadBridge(fetchImpl)
    const xhr = new XHR()
    xhr.open('GET', '/api/info')
    xhr.setRequestHeader('Authorization', 'Bearer old')
    await run(xhr, 'GET', '/api/info')
    expect(
      (fetchImpl.mock.calls[0] as any)[1].headers.authorization
    ).toBeUndefined()
  })

  it('preserves native headers on non-API requests', () => {
    const fetchImpl = jest.fn()
    const { XHR } = loadBridge(fetchImpl)
    const xhr = new XHR()
    xhr.open('GET', '/health')
    xhr.setRequestHeader('Authorization', 'Bearer original')
    xhr.send()
    expect(xhr.requestHeaders.authorization).toBe('Bearer original')
    expect(xhr.nativeSendCount).toBe(1)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('bridges the short API spelling as well as the canonical one', async () => {
    // `/api` is the default spelling now: a caller that uses it has to be
    // bridged, or its answers would come from the static host instead of the
    // mock API.
    const fetchImpl = jest.fn(async () => jsonResponse('{"status":"ok"}'))
    const { XHR } = loadBridge(fetchImpl)

    const xhr = new XHR()
    await run(xhr, 'GET', '/api/info')

    const [url] = fetchImpl.mock.calls[0] as any
    expect(url).toBe('https://app.example/api/info')
    expect(xhr.status).toBe(200)
    expect(xhr.responseText).toBe('{"status":"ok"}')
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

  it('snapshots FormData entries at send before asynchronous file reads', async () => {
    const fetchImpl = jest.fn(async () => jsonResponse('{}'))
    const { XHR } = loadBridge(fetchImpl)
    const form = new FormData()
    form.append('file', new Blob(['file']), 'file.txt')
    form.append('field', 'original')
    const xhr = new XHR()
    const loaded = new Promise((resolve) =>
      xhr.addEventListener('load', resolve)
    )
    xhr.open('POST', '/api/upload')
    xhr.send(form)
    form.set('field', 'changed')
    form.append('late', 'not sent')
    await loaded
    const payload = JSON.parse((fetchImpl.mock.calls[0] as any)[1].body)
    expect(payload.params).toEqual({ field: 'original' })
    expect(payload.tables).toEqual([
      { name: 'file', filename: 'file.txt', csv: 'file' }
    ])
  })

  it('carries a binary file as base64 rather than as damaged text', async () => {
    const fetchImpl = jest.fn(async () => jsonResponse('{"status":"success"}'))
    const { XHR } = loadBridge(fetchImpl)

    // a PNG's signature: valid UTF-8 it is not
    const bytes = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a
    ])

    const form = new FormData()
    form.append('file', new Blob([bytes], { type: 'image/png' }), 'logo.png')

    const xhr = new XHR()
    await run(xhr, 'POST', '/SASjsApi/drive/file', form)

    const [, init] = fetchImpl.mock.calls[0] as any
    const payload = JSON.parse(init.body)

    expect(payload.tables[0].binary).toBe(true)
    expect(payload.tables[0].csv).toBe(btoa('PNG\r\n\n'))
  })

  it('parses the response when the app asked for json', async () => {
    const { XHR } = loadBridge(jest.fn(async () => jsonResponse('{"a":1}')))
    const xhr = new XHR()
    xhr.responseType = 'json'

    await run(xhr, 'GET', '/SASjsApi/info')

    expect(xhr.response).toEqual({ a: 1 })
  })

  it('hands a blob request the bytes, not the body decoded as text', async () => {
    // The Studio's image preview asks for a blob and turns it into an object
    // URL. A PNG answered as text arrives as UTF-8 damage, `<img>` draws
    // nothing, and the screen shows the generic Abort modal - which is what a
    // picture on the published site did.
    const bytes = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d
    ])
    const { XHR } = loadBridge(
      jest.fn(
        async () =>
          new Response(bytes, {
            status: 200,
            headers: { 'content-type': 'image/png' }
          })
      )
    )

    const xhr = new XHR()
    xhr.responseType = 'blob'

    await run(
      xhr,
      'GET',
      '/SASjsApi/drive/file?_filePath=%2FPublic%2Fapp%2Fmacrodash%2Fservices%2Fweb%2Fmacrodash.png'
    )

    expect(xhr.status).toBe(200)
    expect(xhr.response).toBeInstanceOf(Blob)
    expect(xhr.response.type).toBe('image/png')
    expect(xhr.response.size).toBe(bytes.length)
    expect(xhr.responseText).toBe('')

    const readBack = new Uint8Array(await xhr.response.arrayBuffer())
    expect(Array.from(readBack)).toEqual(Array.from(bytes))
  })

  it('hands an arraybuffer request the bytes as well', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4])
    const { XHR } = loadBridge(
      jest.fn(
        async () =>
          new Response(bytes, {
            status: 200,
            headers: { 'content-type': 'application/octet-stream' }
          })
      )
    )

    const xhr = new XHR()
    xhr.responseType = 'arraybuffer'

    await run(xhr, 'GET', '/SASjsApi/drive/file?_filePath=%2Fx.bin')

    expect(Array.from(new Uint8Array(xhr.response))).toEqual([1, 2, 3, 4])
    expect(xhr.responseText).toBe('')
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
    xhr.open('GET', '/health')
    xhr.send()

    expect(xhr.nativeSendCount).toBe(1)
  })
})
