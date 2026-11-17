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

const loadBridge = (
  fetchImpl: jest.Mock,
  base = '/',
  script = true,
  grantImpl: jest.Mock = jest.fn(async () =>
    jsonResponse(JSON.stringify({ paths: ['/SASjsApi/stp/execute'] }))
  )
) => {
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
  window.location = new URL(`https://app.example${base}index.html`)
  ;(global as any).location = window.location
  ;(global as any).document = {
    baseURI: window.location.href,
    currentScript: script
      ? { src: `https://app.example${base}host/intercept.js?v=1` }
      : null
  }
  ;(global as any).localStorage = { getItem: () => null }
  ;(global as any).XMLHttpRequest = XHR
  ;(global as any).Event = class {
    constructor(public type: string) {}
  }
  ;(global as any).ProgressEvent = class {
    constructor(public type: string) {}
  }
  ;(global as any).fetch = (url: string, init: any) =>
    new URL(url).pathname.endsWith('/SASjsApi/info/myAuthorizedRoutes')
      ? grantImpl(url, init)
      : fetchImpl(url, init)
  require('../assets/intercept.js')
  return { window, XHR, grantImpl }
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
    delete (global as any).location
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

  it('bridges root API calls when the bridge is evaluated without a current script', async () => {
    const fetchImpl = jest.fn(async () => jsonResponse('{}'))
    const { XHR } = loadBridge(fetchImpl, '/', false)
    const xhr = new XHR()
    await run(xhr, 'GET', '/api/info')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['/', '/sasstoredprocess/do?_program=x'],
    ['/site/', '/site/SasStoredProcess/DO/?_program=x']
  ])(
    'preauthorizes case-insensitive SAS9 uploads at %s before reading',
    async (base, url) => {
      const fetchImpl = jest.fn(async () => jsonResponse('{}'))
      const grantImpl = jest.fn(async () =>
        jsonResponse(JSON.stringify({ paths: [] }))
      )
      const read = jest.spyOn(Blob.prototype, 'arrayBuffer')
      const errors = jest.spyOn(console, 'error').mockImplementation()
      try {
        const { XHR } = loadBridge(fetchImpl, base, true, grantImpl)
        const form = new FormData()
        form.append('file', new Blob(['private']), 'private.csv')
        const xhr = new XHR()
        const loaded = new Promise((resolve) =>
          xhr.addEventListener('load', resolve)
        )
        xhr.open('POST', url)
        xhr.send(form)
        expect(xhr.nativeSendCount).toBe(0)
        expect(grantImpl).toHaveBeenCalledTimes(1)
        await loaded
        expect(xhr.status).toBe(401)
        expect(JSON.parse(xhr.responseText)).toEqual({
          message: 'Unauthorized'
        })
        expect(read).not.toHaveBeenCalled()
        expect(fetchImpl).not.toHaveBeenCalled()
      } finally {
        errors.mockRestore()
        read.mockRestore()
      }
    }
  )

  it('enforces the upload limit on a lowercase SAS9 endpoint after authorization', async () => {
    const fetchImpl = jest.fn(async () => jsonResponse('{}'))
    const grantImpl = jest.fn(async () =>
      jsonResponse(JSON.stringify({ paths: ['/SASjsApi/stp/execute'] }))
    )
    const read = jest.spyOn(Blob.prototype, 'arrayBuffer')
    const errors = jest.spyOn(console, 'error').mockImplementation()
    try {
      const { XHR } = loadBridge(fetchImpl, '/', true, grantImpl)
      const form = new FormData()
      form.append(
        'file',
        new Blob([new Uint8Array(10 * 1024 * 1024 + 1)]),
        'large.csv'
      )
      const xhr = new XHR()
      const loaded = new Promise((resolve) =>
        xhr.addEventListener('load', resolve)
      )
      xhr.open('POST', '/sasstoredprocess/do')
      xhr.send(form)
      expect(xhr.nativeSendCount).toBe(0)
      expect(grantImpl).toHaveBeenCalledTimes(1)
      await loaded
      expect(xhr.status).toBe(413)
      expect(read).not.toHaveBeenCalled()
      expect(fetchImpl).not.toHaveBeenCalled()
    } finally {
      errors.mockRestore()
      read.mockRestore()
    }
  })

  it('refuses denied SAS9 uploads without reading file bytes', async () => {
    const fetchImpl = jest.fn(async () => jsonResponse('{}'))
    const grantImpl = jest.fn(async () =>
      jsonResponse(JSON.stringify({ paths: [] }))
    )
    const read = jest.spyOn(Blob.prototype, 'arrayBuffer')
    const errors = jest.spyOn(console, 'error').mockImplementation()
    try {
      const { XHR } = loadBridge(fetchImpl, '/', true, grantImpl)
      const form = new FormData()
      form.append('file', new Blob(['private']), 'private.csv')
      const xhr = new XHR()
      await run(xhr, 'POST', '/SASStoredProcess/do?_program=x', form)
      expect(xhr.status).toBe(401)
      expect(JSON.parse(xhr.responseText)).toEqual({ message: 'Unauthorized' })
      expect(read).not.toHaveBeenCalled()
      expect(fetchImpl).not.toHaveBeenCalled()
    } finally {
      errors.mockRestore()
      read.mockRestore()
    }
  })

  it('checks the same caller and token before reading SAS9 files', async () => {
    const fetchImpl = jest.fn(async () => jsonResponse('{}'))
    let resolveGrant: (value: Response) => void = () => {}
    const grantImpl = jest.fn(
      () => new Promise<Response>((resolve) => (resolveGrant = resolve))
    )
    const read = jest.spyOn(Blob.prototype, 'arrayBuffer')
    try {
      const { XHR } = loadBridge(fetchImpl, '/site/', true, grantImpl)
      const form = new FormData()
      form.append('file', new Blob(['private']), 'private.csv')
      form.append('field', 'original')
      const xhr = new XHR()
      const loaded = new Promise((resolve) =>
        xhr.addEventListener('load', resolve)
      )
      xhr.open(
        'POST',
        '/site/SASStoredProcess/do?access_token=first&access_token=last'
      )
      xhr.setRequestHeader('Authorization', 'Bearer secret')
      xhr.send(form)
      form.set('field', 'changed')
      expect(read).not.toHaveBeenCalled()
      const [target, init] = grantImpl.mock.calls[0] as any
      expect(target).toBe(
        'https://app.example/site/SASjsApi/info/myAuthorizedRoutes?access_token=first&access_token=last'
      )
      expect(init.method).toBe('GET')
      expect(init.credentials).toBe('same-origin')
      expect(init.mode).toBe('same-origin')
      expect(init.headers.authorization).toBe('Bearer secret')
      resolveGrant(
        jsonResponse(JSON.stringify({ paths: ['/SASjsApi/stp/execute'] }))
      )
      await loaded
      expect(read).toHaveBeenCalledTimes(1)
      const payload = JSON.parse((fetchImpl.mock.calls[0] as any)[1].body)
      expect(payload.params.field).toBe('original')
      expect(payload.tables[0].csv).toBe('private')
    } finally {
      read.mockRestore()
    }
  })

  it('does not read SAS9 files after aborting a pending grant check', async () => {
    let resolveGrant: (value: Response) => void = () => {}
    const grantImpl = jest.fn(
      () => new Promise<Response>((resolve) => (resolveGrant = resolve))
    )
    const fetchImpl = jest.fn(async () => jsonResponse('{}'))
    const read = jest.spyOn(Blob.prototype, 'arrayBuffer')
    try {
      const { XHR } = loadBridge(fetchImpl, '/', true, grantImpl)
      const form = new FormData()
      form.append('file', new Blob(['private']), 'private.csv')
      const xhr = new XHR()
      xhr.open('POST', '/SASStoredProcess/do')
      xhr.send(form)
      const signal = (grantImpl.mock.calls[0] as any)[1].signal
      xhr.abort()
      expect(signal.aborted).toBe(true)
      resolveGrant(
        jsonResponse(JSON.stringify({ paths: ['/SASjsApi/stp/execute'] }))
      )
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(read).not.toHaveBeenCalled()
      expect(fetchImpl).not.toHaveBeenCalled()
    } finally {
      read.mockRestore()
    }
  })

  it('does not read SAS9 files when reopened during the grant check', async () => {
    let resolveGrant: (value: Response) => void = () => {}
    const grantImpl = jest.fn(
      () => new Promise<Response>((resolve) => (resolveGrant = resolve))
    )
    const fetchImpl = jest.fn(async () => jsonResponse('{}'))
    const read = jest.spyOn(Blob.prototype, 'arrayBuffer')
    try {
      const { XHR } = loadBridge(fetchImpl, '/', true, grantImpl)
      const form = new FormData()
      form.append('file', new Blob(['private']), 'private.csv')
      const xhr = new XHR()
      xhr.open('POST', '/SASStoredProcess/do')
      xhr.send(form)
      const signal = (grantImpl.mock.calls[0] as any)[1].signal
      xhr.open('POST', 'https://evil.example/SASStoredProcess/do')
      expect(signal.aborted).toBe(true)
      resolveGrant(
        jsonResponse(JSON.stringify({ paths: ['/SASjsApi/stp/execute'] }))
      )
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(read).not.toHaveBeenCalled()
      expect(fetchImpl).not.toHaveBeenCalled()
    } finally {
      read.mockRestore()
    }
  })

  it.each([
    ['invalid token', 401, '{"message":"Unauthorized"}', 401],
    ['malformed grant', 200, '{"unexpected":true}', 500],
    ['upstream failure', 503, '{"message":"unavailable"}', 503]
  ])(
    'fails closed for %s before reading a SAS9 file',
    async (_name, status, body, expected) => {
      const grantImpl = jest.fn(async () => jsonResponse(body, status))
      const fetchImpl = jest.fn(async () => jsonResponse('{}'))
      const errors = jest.spyOn(console, 'error').mockImplementation()
      const read = jest.spyOn(Blob.prototype, 'arrayBuffer')
      try {
        const { XHR } = loadBridge(fetchImpl, '/', true, grantImpl)
        const form = new FormData()
        form.append('file', new Blob(['private']), 'private.csv')
        const xhr = new XHR()
        await run(xhr, 'POST', '/SASStoredProcess/do', form)
        expect(xhr.status).toBe(expected)
        expect(read).not.toHaveBeenCalled()
        expect(fetchImpl).not.toHaveBeenCalled()
      } finally {
        errors.mockRestore()
        read.mockRestore()
      }
    }
  )

  it('preserves SAS9 authorization and rejects late headers', async () => {
    const fetchImpl = jest.fn(async () => jsonResponse('{}'))
    const { XHR } = loadBridge(fetchImpl)
    const xhr = new XHR()
    const loaded = new Promise((resolve) =>
      xhr.addEventListener('load', resolve)
    )
    xhr.open('POST', '/SASStoredProcess/do')
    xhr.setRequestHeader('Authorization', 'Bearer secret')
    xhr.setRequestHeader('X-Unrelated', 'do not forward')
    xhr.send(new FormData())
    expect(() => xhr.setRequestHeader('Authorization', 'late')).toThrow(
      expect.objectContaining({ name: 'InvalidStateError' })
    )
    await loaded
    expect((fetchImpl.mock.calls[0] as any)[1].headers).toEqual({
      accept: '*/*',
      authorization: 'Bearer secret',
      'content-type': 'application/json'
    })
  })

  it('does not forward a SAS9 token when reopened while a file is being read', async () => {
    let finishRead: (value: ArrayBuffer) => void = () => {}
    const read = jest.spyOn(Blob.prototype, 'arrayBuffer').mockImplementation(
      () =>
        new Promise((resolve) => {
          finishRead = resolve
        })
    )
    try {
      const fetchImpl = jest.fn(async () => jsonResponse('{}'))
      const { XHR } = loadBridge(fetchImpl)
      const form = new FormData()
      form.append('file', new Blob(['private']), 'input.csv')
      const xhr = new XHR()
      xhr.open('POST', '/SASStoredProcess/do')
      xhr.setRequestHeader('Authorization', 'Bearer secret')
      xhr.send(form)
      xhr.open('POST', 'https://evil.example/SASStoredProcess/do')
      finishRead(new TextEncoder().encode('private').buffer)
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(fetchImpl).not.toHaveBeenCalled()
    } finally {
      read.mockRestore()
    }
  })

  it('snapshots SAS9 table chunks and declarations before file reads', async () => {
    const fetchImpl = jest.fn(async () => jsonResponse('{}'))
    const { XHR } = loadBridge(fetchImpl)
    const form = new FormData()
    form.append('file', new Blob(['file']), 'input.csv')
    form.append('sasjs1data', 'first')
    form.append('sasjs1data', 'second')
    form.append('sasjs_tables', 'input')
    const xhr = new XHR()
    const loaded = new Promise((resolve) =>
      xhr.addEventListener('load', resolve)
    )
    xhr.open('POST', '/SASStoredProcess/do')
    xhr.send(form)
    form.set('sasjs1data', 'changed')
    form.set('sasjs_tables', '')
    await loaded
    expect(JSON.parse((fetchImpl.mock.calls[0] as any)[1].body).params).toEqual(
      {
        sasjs1data: 'firstsecond',
        sasjs_tables: 'input'
      }
    )
  })

  it('rejects a second SAS9 send even if the replacement body is not multipart', () => {
    const { XHR } = loadBridge(jest.fn(async () => jsonResponse('{}')))
    const xhr = new XHR()
    xhr.open('POST', '/SASStoredProcess/do')
    xhr.send(new FormData())
    expect(() => xhr.send('plain body')).toThrow(
      expect.objectContaining({ name: 'InvalidStateError' })
    )
  })

  it('bridges a SAS9 multipart execution with fields and CSV files', async () => {
    const fetchImpl = jest.fn(async () => jsonResponse('{"ok":true}'))
    const { XHR } = loadBridge(fetchImpl, '/site/')
    const form = new FormData()
    form.append('_debug', '131')
    form.append('input', new Blob(['name:$char5.\nAlice']), 'input.csv')
    const xhr = new XHR()
    const url = '/site/SASStoredProcess/do/?_program=%2FPublic%2Ftest'
    const loaded = new Promise((resolve) =>
      xhr.addEventListener('load', resolve)
    )
    xhr.open('POST', url)
    xhr.send(form)

    expect(xhr.nativeSendCount).toBe(0)
    await loaded
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [target, init] = fetchImpl.mock.calls[0] as any
    expect(target).toBe(`https://app.example${url}`)
    expect(JSON.parse(init.body)).toEqual({
      params: { _debug: '131' },
      tables: [
        { name: 'input', filename: 'input.csv', csv: 'name:$char5.\nAlice' }
      ]
    })
    expect(xhr.status).toBe(200)
    expect(xhr.responseText).toBe('{"ok":true}')
  })

  it('refuses an oversized SAS9 upload before reading any files', async () => {
    const fetchImpl = jest.fn(async () => jsonResponse('{"ok":true}'))
    const { XHR } = loadBridge(fetchImpl)
    const form = new FormData()
    form.append('first', new Blob(['small']), 'small.csv')
    form.append(
      'large',
      new Blob([new Uint8Array(10 * 1024 * 1024 + 1)]),
      'large.csv'
    )
    const read = jest.spyOn(Blob.prototype, 'arrayBuffer')
    const xhr = new XHR()
    const events: string[] = []
    for (const event of ['readystatechange', 'load', 'loadend'])
      xhr.addEventListener(event, () => events.push(event))

    await run(xhr, 'POST', '/SASStoredProcess/do?_program=x', form)

    expect(xhr.status).toBe(413)
    expect(xhr.readyState).toBe(4)
    expect(xhr.getResponseHeader('content-type')).toBe('application/json')
    expect(JSON.parse(xhr.responseText)).toEqual({
      message: 'The upload is larger than the browser host allows (10 MB).'
    })
    expect(events).toEqual([
      'readystatechange',
      'readystatechange',
      'load',
      'loadend'
    ])
    expect(read).not.toHaveBeenCalled()
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(xhr.nativeSendCount).toBe(0)
  })

  it.each(['blob', 'arraybuffer'])(
    'returns the SAS9 413 body as %s',
    async (type) => {
      const fetchImpl = jest.fn()
      const { XHR } = loadBridge(fetchImpl)
      const form = new FormData()
      form.append(
        'large',
        new Blob([new Uint8Array(10 * 1024 * 1024 + 1)]),
        'large.csv'
      )
      const xhr = new XHR()
      xhr.responseType = type

      await run(xhr, 'POST', '/SASStoredProcess/do', form)

      expect(xhr.status).toBe(413)
      const bytes =
        type === 'blob'
          ? new Uint8Array(await xhr.response.arrayBuffer())
          : new Uint8Array(xhr.response)
      expect(JSON.parse(new TextDecoder().decode(bytes))).toEqual({
        message: 'The upload is larger than the browser host allows (10 MB).'
      })
      expect(xhr.responseText).toBe('')
      expect(fetchImpl).not.toHaveBeenCalled()
    }
  )

  it('accepts each SAS9 file up to the 10 MiB per-file boundary', async () => {
    const fetchImpl = jest.fn(async () => jsonResponse('{"ok":true}'))
    const { XHR } = loadBridge(fetchImpl)
    const form = new FormData()
    form.append(
      'atLimit',
      new Blob(['x'.repeat(10 * 1024 * 1024)]),
      'limit.csv'
    )
    form.append('second', new Blob(['extra']), 'second.csv')
    const xhr = new XHR()

    await run(xhr, 'POST', '/SASStoredProcess/do', form)

    expect(xhr.status).toBe(200)
    const [, init] = fetchImpl.mock.calls[0] as any
    const payload = JSON.parse(init.body)
    expect(payload.tables.map((table: any) => table.csv.length)).toEqual([
      10 * 1024 * 1024,
      5
    ])
  })

  it('returns a parsed JSON SAS9 upload refusal', async () => {
    const fetchImpl = jest.fn()
    const { XHR } = loadBridge(fetchImpl)
    const form = new FormData()
    form.append(
      'large',
      new Blob([new Uint8Array(10 * 1024 * 1024 + 1)]),
      'large.csv'
    )
    const xhr = new XHR()
    xhr.responseType = 'json'

    await run(xhr, 'POST', '/SASStoredProcess/do', form)

    expect(xhr.status).toBe(413)
    expect(xhr.response).toEqual({
      message: 'The upload is larger than the browser host allows (10 MB).'
    })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('keeps similarly named or out-of-scope API requests native', () => {
    const fetchImpl = jest.fn()
    const { XHR } = loadBridge(fetchImpl, '/site/')
    for (const url of [
      'https://other.test/site/SASjsApi/info',
      '/other/SASjsApi/info',
      '/site/other/api/info',
      '/site2/api/info',
      '/site/health?next=/api/info',
      'https://other.test/site/SASStoredProcess/do',
      '/site2/SASStoredProcess/do',
      '/site/SASStoredProcess/double',
      '/site/SASStoredProcess/do/extra',
      'https://other.test/site/sasstoredprocess/do',
      '/SITE/sasstoredprocess/do',
      '/site2/sasstoredprocess/do',
      '/site/sasstoredprocess/double',
      '/site/sasstoredprocess/do/extra'
    ]) {
      const xhr = new XHR()
      xhr.open('POST', url)
      xhr.send(new FormData())
      expect({ url, native: xhr.nativeSendCount }).toEqual({ url, native: 1 })
    }
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('leaves non-multipart SAS9 and authentication requests native', () => {
    const fetchImpl = jest.fn()
    const { XHR } = loadBridge(fetchImpl)
    for (const [method, url, body] of [
      ['GET', '/SASStoredProcess/do?_action=properties', undefined],
      ['POST', '/SASStoredProcess/do', 'plain body'],
      ['POST', '/SASLogon/login', new FormData()]
    ]) {
      const xhr = new XHR()
      xhr.open(method as string, url as string)
      xhr.send(body)
      expect(xhr.nativeSendCount).toBe(1)
      expect(xhr.sentWith).toBe(body)
    }
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('bridges root-relative and absolute same-origin SAS9 endpoints', async () => {
    const fetchImpl = jest.fn(async () => jsonResponse('ok'))
    const { XHR } = loadBridge(fetchImpl)
    for (const url of [
      '/SASStoredProcess/do?_program=x',
      'https://app.example/SASStoredProcess/do/?_program=x',
      'SASStoredProcess/do?_program=x'
    ]) {
      const xhr = new XHR()
      await run(xhr, 'post', url, new FormData())
      expect(xhr.nativeSendCount).toBe(0)
      expect(xhr.responseText).toBe('ok')
    }
    expect(fetchImpl).toHaveBeenCalledTimes(3)
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

  it('preserves adapter parameter-table chunks sent through a bridged XHR', async () => {
    const fetchImpl = jest.fn(async () => jsonResponse('{"ok":true}'))
    const { XHR } = loadBridge(fetchImpl)
    const form = new FormData()
    const data = {
      small: [{ TEXT: 'short' }],
      long: [{ TEXT: 'a'.repeat(15980) + ',"Zoë\r\n' + 'b'.repeat(15000) }],
      last: [{ TEXT: 'end' }]
    }
    // WebJobExecutor's parameter transport appends long chunks first, then
    // sasjs_tables and short CSVs. A Viya endpoint can be configured under /api.
    const { requestParams } =
      require('@sasjs/adapter/file/generateTableUploadForm').generateTableUploadForm(
        form,
        data
      )
    const chunks = form.getAll('sasjs2data')
    expect(chunks.length).toBeGreaterThan(1)
    for (const [name, value] of Object.entries(requestParams))
      form.append(name, String(value))
    form.append('ordinary', 'first')
    form.append('ordinary', 'second')
    form.append('sasjs4data', 'first')
    form.append('sasjs4data', 'second')
    form.append('file', new Blob(['file contents']), 'test.csv')

    const xhr = new XHR()
    await run(xhr, 'POST', '/api/stp/execute/?_program=x', form)

    const [, init] = fetchImpl.mock.calls[0] as any
    expect(JSON.parse(init.body)).toEqual({
      params: {
        ...requestParams,
        sasjs2data: chunks.join(''),
        ordinary: 'second',
        sasjs4data: 'second'
      },
      tables: [{ name: 'file', filename: 'test.csv', csv: 'file contents' }]
    })
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
