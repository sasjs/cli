/**
 * Page-side bridge for the browser build.
 *
 * The real work happens in the service worker (see /sw.js), so every request
 * still goes over the network layer and is visible in DevTools > Network as
 * "(from ServiceWorker)" - request payload and response body included.
 *
 * Two things are this file's job:
 *   1. XHR bodies are multipart (the adapter always sends them that way).
 *      Reading multipart inside a worker is unreliable for XHR-originated
 *      requests, so the payload is converted to JSON here, where reading a
 *      FormData is trivial.
 *   2. The XHR object the app is holding must behave like a normal one: status,
 *      readyState, responseText and real load events.
 */
;(function () {
  if (window.__sasjsMockBridgeInstalled) return
  window.__sasjsMockBridgeInstalled = true

  // Set localStorage sasjsMockDebug='1' and reload to see this bridge's traffic
  // in the console.
  const DEBUG = (() => {
    try {
      return localStorage.getItem('sasjsMockDebug') === '1'
    } catch (e) {
      return false
    }
  })()

  const dbg = (...args) => {
    if (DEBUG) console.log('[sasjs-mock]', ...args)
  }

  /**
   * A file's contents, as text or as base64 with a flag.
   *
   * An upload is a file, not a string: a PNG, a workbook or an .sas7bdat read
   * with `text()` arrives as replacement characters, and the drive would store
   * the damage under a success status. The bytes are decoded as UTF-8 strictly -
   * if that fails, they are not text by any reading a browser would accept - and
   * carried as base64, which the worker turns back into the bytes the drive
   * keeps.
   */
  const contentsOf = async (value) => {
    const bytes = new Uint8Array(await value.arrayBuffer())

    try {
      return { csv: new TextDecoder('utf-8', { fatal: true }).decode(bytes) }
    } catch (error) {
      let binary = ''
      const chunk = 0x8000
      for (let i = 0; i < bytes.length; i += chunk)
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk))

      return { csv: btoa(binary), binary: true }
    }
  }

  // Match the worker's per-file multipart limit before the page materialises
  // the SAS9 adapter's files into its JSON envelope.
  const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

  const readBody = async (body, limitFiles, snapshot, isCurrent) => {
    const params = {}
    const tables = []
    if (!body) return { params, tables }

    if (typeof FormData !== 'undefined' && body instanceof FormData) {
      // Snapshot once before any asynchronous file read; use the same entries
      // for size checks, table declarations and conversion.
      const entries = snapshot || Array.from(body.entries())
      if (limitFiles) {
        for (const [, value] of entries) {
          if (typeof value !== 'string' && value.size > MAX_UPLOAD_BYTES) {
            const error = new Error(
              'The upload is larger than the browser host allows (10 MB).'
            )
            error.status = 413
            throw error
          }
        }
      }
      // Long adapter CSVs are appended in ordered chunks, before the declaration.
      const declarations = entries.filter(
        ([key]) => key.toLowerCase() === 'sasjs_tables'
      )
      const tableNames = String(
        (declarations.length && declarations[declarations.length - 1][1]) || ''
      )
        .trim()
        .split(/\s+/)
        .filter(Boolean)
      const tableFields = new Set(
        tableNames.map((_name, index) => `sasjs${index + 1}data`)
      )
      for (const [key, value] of entries) {
        if (isCurrent && !isCurrent()) return { params, tables }
        if (typeof value === 'string') {
          if (
            tableFields.has(key.toLowerCase()) &&
            Object.prototype.hasOwnProperty.call(params, key)
          )
            params[key] += value
          else params[key] = value
        } else {
          const contents = await contentsOf(value)

          tables.push({
            name: key,
            filename: value.name || key + '.csv',
            csv: contents.csv,
            ...(contents.binary ? { binary: true } : {})
          })
        }
      }
      return { params, tables }
    }

    if (typeof body === 'string') {
      try {
        const parsed = JSON.parse(body)
        return { params: {}, tables: [], json: parsed }
      } catch (e) {
        return { params: {}, tables: [] }
      }
    }
    return { params, tables }
  }

  const safeParse = (text) => {
    try {
      return JSON.parse(text)
    } catch (e) {
      return text
    }
  }

  const responseProperties = [
    'status',
    'statusText',
    'readyState',
    'responseText',
    'responseURL',
    'response',
    'getAllResponseHeaders',
    'getResponseHeader'
  ]
  const respond = (xhr, status, contentType, body, bytes) => {
    const generation = xhr.__sasjsMockGeneration
    xhr.__sasjsMockOriginalResponse = Object.fromEntries(
      responseProperties.map((key) => [
        key,
        Object.getOwnPropertyDescriptor(xhr, key)
      ])
    )
    Object.defineProperty(xhr, 'status', { value: status, configurable: true })
    Object.defineProperty(xhr, 'statusText', {
      value: status === 200 ? 'OK' : 'ERROR',
      configurable: true
    })
    Object.defineProperty(xhr, 'readyState', { value: 4, configurable: true })
    // `bytes` is set when the caller asked for a blob or an arraybuffer. The
    // drive serves PNGs, PDFs and workbooks, and answering a blob request with
    // the body decoded as text hands `<img>` mojibake - which is how a picture
    // on the site came to fail to render with an "Abort" modal.
    const binary = bytes !== undefined
    Object.defineProperty(xhr, 'responseText', {
      value: binary ? '' : body,
      configurable: true
    })
    Object.defineProperty(xhr, 'responseURL', {
      value: xhr.__sasjsMockUrl,
      configurable: true
    })
    Object.defineProperty(xhr, 'response', {
      value: binary
        ? xhr.responseType === 'arraybuffer'
          ? bytes.buffer.slice(
              bytes.byteOffset,
              bytes.byteOffset + bytes.byteLength
            )
          : new Blob([bytes], { type: contentType })
        : xhr.responseType === 'json'
          ? safeParse(body)
          : body,
      configurable: true
    })
    xhr.getAllResponseHeaders = () => 'content-type: ' + contentType + '\r\n'
    xhr.getResponseHeader = (key) =>
      key && key.toLowerCase() === 'content-type' ? contentType : null

    generation.completed = true
    xhr.dispatchEvent(new Event('readystatechange'))
    if (xhr.__sasjsMockGeneration !== generation) return
    xhr.dispatchEvent(new ProgressEvent('load'))
    if (xhr.__sasjsMockGeneration !== generation) return
    xhr.dispatchEvent(new ProgressEvent('loadend'))
  }

  // The mock worker only owns routes below its own mount on this origin.
  const scriptSrc = document.currentScript && document.currentScript.src
  const mockBase = scriptSrc
    ? new URL('../', scriptSrc)
    : new URL('/', window.location.href)
  const mockPath = (url) => {
    try {
      if (!mockBase) return null
      const target = new URL(url, window.location.href)
      if (
        target.origin !== window.location.origin ||
        target.origin !== mockBase.origin ||
        !target.pathname.startsWith(mockBase.pathname)
      )
        return null
      return target.pathname.slice(mockBase.pathname.length)
    } catch (e) {
      return null
    }
  }
  // `/api` is the short spelling of `/SASjsApi`.
  const isSasjs = (url) => /^(SASjsApi|api)\//.test(mockPath(url) || '')

  // SAS9's adapter posts multipart to the stored-process endpoint. Session and
  // authentication requests on that endpoint should remain native XHRs.
  const isSas9Multipart = (url, method, body) =>
    (method || '').toUpperCase() === 'POST' &&
    typeof FormData !== 'undefined' &&
    body instanceof FormData &&
    /^SASStoredProcess\/do\/?$/i.test(mockPath(url) || '')

  const proto = XMLHttpRequest.prototype
  const nativeOpen = proto.open
  const nativeSend = proto.send
  const nativeSetRequestHeader = proto.setRequestHeader
  const nativeAbort = proto.abort

  const restoreResponse = (xhr) => {
    if (!xhr.__sasjsMockOriginalResponse) return
    for (const key of responseProperties) {
      const descriptor = xhr.__sasjsMockOriginalResponse[key]
      if (descriptor) Object.defineProperty(xhr, key, descriptor)
      else delete xhr[key]
    }
    delete xhr.__sasjsMockOriginalResponse
  }

  proto.abort = function () {
    const generation = this.__sasjsMockGeneration
    const pending = generation && generation.sent && !generation.completed
    if (pending) {
      this.__sasjsMockGeneration = undefined
      if (generation.controller) generation.controller.abort()
      // Native XHR never saw send(), so reset it before replaying abort events.
      const result = nativeAbort.apply(this, arguments)
      const priorReadyState = Object.getOwnPropertyDescriptor(
        this,
        'readyState'
      )
      this.__sasjsMockAbortReadyState = { descriptor: priorReadyState }
      Object.defineProperty(this, 'readyState', {
        value: 4,
        configurable: true
      })
      this.dispatchEvent(new Event('readystatechange'))
      this.dispatchEvent(new ProgressEvent('abort'))
      this.dispatchEvent(new ProgressEvent('loadend'))
      if (this.__sasjsMockAbortReadyState)
        Object.defineProperty(this, 'readyState', {
          value: 0,
          configurable: true
        })
      return result
    }
    const completed = !!this.__sasjsMockOriginalResponse
    restoreResponse(this)
    const result = nativeAbort.apply(this, arguments)
    if (completed) {
      this.__sasjsMockGeneration = undefined
      const descriptor = Object.getOwnPropertyDescriptor(this, 'readyState')
      this.__sasjsMockAbortReadyState = { descriptor }
      Object.defineProperty(this, 'readyState', {
        value: 0,
        configurable: true
      })
    } else if (this.__sasjsMockAbortReadyState) {
      // A nested abort during the synthetic DONE event resets the exposed
      // state before the outer abort and loadend events, just like native XHR.
      Object.defineProperty(this, 'readyState', {
        value: 0,
        configurable: true
      })
    }
    return result
  }

  proto.open = function (method, url) {
    const abortedState = this.__sasjsMockAbortReadyState
    const abortedReadyState = abortedState
      ? Object.getOwnPropertyDescriptor(this, 'readyState')
      : undefined
    const abortDone = abortedState && this.readyState === 4
    if (this.__sasjsMockAbortReadyState) {
      const descriptor = this.__sasjsMockAbortReadyState.descriptor
      if (descriptor) Object.defineProperty(this, 'readyState', descriptor)
      else delete this.readyState
      delete this.__sasjsMockAbortReadyState
    }
    const previous = {
      generation: this.__sasjsMockGeneration,
      method: this.__sasjsMockMethod,
      url: this.__sasjsMockUrl,
      authorization: this.__sasjsMockAuthorization
    }
    const syntheticDone = !!this.__sasjsMockOriginalResponse
    const originalResponse = this.__sasjsMockOriginalResponse
    const syntheticResponse = syntheticDone
      ? Object.fromEntries(
          responseProperties.map((key) => [
            key,
            Object.getOwnPropertyDescriptor(this, key)
          ])
        )
      : undefined
    let observedOpenEvent = false
    const observeOpen = () => {
      observedOpenEvent = true
    }
    if (syntheticDone || abortDone)
      this.addEventListener('readystatechange', observeOpen)
    const generation = (this.__sasjsMockGeneration = { sent: false })
    if (this.__sasjsMockOriginalResponse) {
      for (const key of responseProperties) {
        const descriptor = this.__sasjsMockOriginalResponse[key]
        if (descriptor) Object.defineProperty(this, key, descriptor)
        else delete this[key]
      }
      delete this.__sasjsMockOriginalResponse
    }
    this.__sasjsMockMethod = method
    try {
      this.__sasjsMockUrl = new URL(
        String(url),
        document.baseURI || window.location.href
      ).href
    } catch (error) {
      this.__sasjsMockUrl = undefined
    }
    this.__sasjsMockAuthorization = undefined
    try {
      const result = nativeOpen.apply(this, arguments)
      if (previous.generation && previous.generation.controller)
        previous.generation.controller.abort()
      if (
        (syntheticDone || abortDone) &&
        !observedOpenEvent &&
        this.__sasjsMockGeneration === generation
      )
        this.dispatchEvent(new Event('readystatechange'))
      return result
    } catch (error) {
      if (this.__sasjsMockGeneration === generation) {
        this.__sasjsMockGeneration = previous.generation
        this.__sasjsMockMethod = previous.method
        this.__sasjsMockUrl = previous.url
        this.__sasjsMockAuthorization = previous.authorization
        if (abortedState) {
          this.__sasjsMockAbortReadyState = abortedState
          Object.defineProperty(this, 'readyState', abortedReadyState)
        }
        if (syntheticDone) {
          for (const key of responseProperties) {
            if (syntheticResponse[key])
              Object.defineProperty(this, key, syntheticResponse[key])
            else delete this[key]
          }
          this.__sasjsMockOriginalResponse = originalResponse
        }
      }
      throw error
    } finally {
      if (syntheticDone || abortDone)
        this.removeEventListener('readystatechange', observeOpen)
    }
  }

  // Only authorization is needed by the worker. In particular, forwarding the
  // original multipart content-type would make the converted JSON unreadable;
  // forwarding arbitrary or browser-forbidden headers is not safe either.
  proto.setRequestHeader = function (name, value) {
    if (
      this.__sasjsMockGeneration &&
      this.__sasjsMockGeneration.bridged &&
      this.__sasjsMockGeneration.sent
    )
      throw new DOMException(
        'The object is in an invalid state.',
        'InvalidStateError'
      )
    const result = nativeSetRequestHeader.apply(this, arguments)
    if (String(name).toLowerCase() === 'authorization') {
      const previous = this.__sasjsMockAuthorization
      const normalized = String(value).replace(/^[\t ]+|[\t ]+$/g, '')
      this.__sasjsMockAuthorization =
        previous === undefined ? normalized : previous + ', ' + normalized
    }
    return result
  }

  proto.send = function (body) {
    if (this.__sasjsMockGeneration && this.__sasjsMockGeneration.bridged)
      throw new DOMException(
        'The object is in an invalid state.',
        'InvalidStateError'
      )
    if (
      !isSasjs(this.__sasjsMockUrl) &&
      !isSas9Multipart(this.__sasjsMockUrl, this.__sasjsMockMethod, body)
    )
      return nativeSend.apply(this, arguments)
    if (
      this.readyState !== 1 ||
      !this.__sasjsMockGeneration ||
      this.__sasjsMockGeneration.sent
    )
      throw new DOMException(
        'The object is in an invalid state.',
        'InvalidStateError'
      )
    this.__sasjsMockGeneration.sent = true
    this.__sasjsMockGeneration.bridged = true

    const xhr = this
    const method = (this.__sasjsMockMethod || 'GET').toUpperCase()
    const authorization = this.__sasjsMockAuthorization
    const url = this.__sasjsMockUrl
    const generation = this.__sasjsMockGeneration
    generation.controller = new AbortController()

    const sas9 = isSas9Multipart(url, method, body)
    // Snapshot at send(), before the grant lookup can yield to application code.
    const snapshot = sas9 ? Array.from(body.entries()) : undefined
    const isCurrent = () => xhr.__sasjsMockGeneration === generation

    ;(async () => {
      const init = {
        method,
        credentials: 'same-origin',
        mode: 'same-origin',
        signal: generation.controller.signal,
        headers: { accept: '*/*' }
      }
      if (authorization !== undefined)
        init.headers.authorization = authorization

      if (sas9) {
        // The same package decision the run route uses, asked before any file
        // bytes are read. The eventual execution still performs its own check.
        const authUrl = new URL('SASjsApi/info/myAuthorizedRoutes', mockBase)
        const token = new URL(url).searchParams
        for (const value of token.getAll('access_token'))
          authUrl.searchParams.append('access_token', value)
        const grant = await fetch(authUrl.href, { ...init, method: 'GET' })
        if (!isCurrent()) return
        if (grant.status !== 200) return grant
        const result = await grant.json()
        if (!isCurrent()) return
        if (!result || !Array.isArray(result.paths))
          throw new Error('Invalid authorization response')
        if (!result.paths.includes('/SASjsApi/stp/execute'))
          return new Response(JSON.stringify({ message: 'Unauthorized' }), {
            status: 401,
            headers: { 'content-type': 'application/json' }
          })
      }

      const payload = await readBody(body, sas9, snapshot, isCurrent)
      if (!isCurrent()) return
      if (method !== 'GET' && method !== 'HEAD') {
        init.headers['content-type'] = 'application/json'
        init.body = JSON.stringify(payload)
      }
      dbg(method, url, payload.tables.map((t) => t.name).join('|'))
      return fetch(url, init)
    })()
      .then(async (res) => {
        if (!isCurrent()) return
        const contentType = res.headers.get('content-type') || 'text/plain'

        // A caller that asked for bytes must be handed them as bytes: the same
        // request answered with `res.text()` gives a PNG's UTF-8 damage, and the
        // image or file the caller builds from it is unusable.
        const wantsBytes =
          xhr.responseType === 'blob' || xhr.responseType === 'arraybuffer'

        if (wantsBytes) {
          const bytes = new Uint8Array(await res.arrayBuffer())
          if (xhr.__sasjsMockGeneration !== generation) return
          if (res.status >= 400)
            console.error(
              '[sasjs-mock] ' +
                xhr.__sasjsMockUrl +
                ' -> ' +
                res.status +
                ' ' +
                new TextDecoder().decode(bytes).slice(0, 400)
            )
          respond(xhr, res.status, contentType, '', bytes)
          return
        }

        const text = await res.text()
        if (xhr.__sasjsMockGeneration !== generation) return
        if (res.status >= 400)
          console.error(
            '[sasjs-mock] ' +
              xhr.__sasjsMockUrl +
              ' -> ' +
              res.status +
              ' ' +
              text.slice(0, 400)
          )
        respond(xhr, res.status, contentType, text)
      })
      .catch((err) => {
        if (xhr.__sasjsMockGeneration !== generation) return
        const message = String((err && err.message) || err)
        if (err && err.status === 413) {
          const body = JSON.stringify({ message })
          const bytes =
            xhr.responseType === 'blob' || xhr.responseType === 'arraybuffer'
              ? new TextEncoder().encode(body)
              : undefined
          respond(xhr, 413, 'application/json', body, bytes)
          return
        }
        console.error(
          '[sasjs-mock] request failed: ' + xhr.__sasjsMockUrl + ' - ' + message
        )
        respond(
          xhr,
          500,
          'application/json',
          JSON.stringify({ message: message, error: message })
        )
      })
  }

  // fetch() is used by nothing in this build, but answering it keeps the
  // bridge honest if a code path switches transport.
  window.__sasjsMockHostStats = async () => {
    const reg = await navigator.serviceWorker.ready
    return {
      active: !!reg.active,
      controller: !!navigator.serviceWorker.controller
    }
  }
})()
