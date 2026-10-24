/**
 * Page-side bridge for the single-page demo.
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
  if (window.__dcBridgeInstalled) return
  window.__dcBridgeInstalled = true

  const dbg = (...args) => {
    if (window.__dcDebug) console.log('[dc-host]', ...args)
  }

  const readBody = async (body) => {
    const params = {}
    const tables = []
    if (!body) return { params, tables }

    if (typeof FormData !== 'undefined' && body instanceof FormData) {
      for (const [key, value] of body.entries()) {
        if (typeof value === 'string') params[key] = value
        else tables.push({ name: key, filename: value.name || key + '.csv', csv: await value.text() })
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

  const respond = (xhr, status, contentType, body) => {
    Object.defineProperty(xhr, 'status', { value: status, configurable: true })
    Object.defineProperty(xhr, 'statusText', { value: status === 200 ? 'OK' : 'ERROR', configurable: true })
    Object.defineProperty(xhr, 'readyState', { value: 4, configurable: true })
    Object.defineProperty(xhr, 'responseText', { value: body, configurable: true })
    Object.defineProperty(xhr, 'responseURL', { value: xhr.__dcUrl, configurable: true })
    Object.defineProperty(xhr, 'response', {
      value: xhr.responseType === 'json' ? safeParse(body) : body,
      configurable: true
    })
    xhr.getAllResponseHeaders = () => 'content-type: ' + contentType + '\r\n'
    xhr.getResponseHeader = (key) =>
      key && key.toLowerCase() === 'content-type' ? contentType : null

    xhr.dispatchEvent(new Event('readystatechange'))
    xhr.dispatchEvent(new ProgressEvent('load'))
    xhr.dispatchEvent(new ProgressEvent('loadend'))
  }

  const isSasjs = (url) => typeof url === 'string' && url.indexOf('/SASjsApi/') >= 0

  const proto = XMLHttpRequest.prototype
  const nativeOpen = proto.open
  const nativeSend = proto.send

  proto.open = function (method, url) {
    this.__dcMethod = method
    this.__dcUrl = String(url)
    return nativeOpen.apply(this, arguments)
  }

  proto.send = function (body) {
    if (!isSasjs(this.__dcUrl)) return nativeSend.apply(this, arguments)

    const xhr = this
    const method = (this.__dcMethod || 'GET').toUpperCase()

    readBody(body)
      .then(async (payload) => {
        const init = { method, credentials: 'same-origin', headers: { accept: '*/*' } }
        if (method !== 'GET' && method !== 'HEAD') {
          init.headers['content-type'] = 'application/json'
          init.body = JSON.stringify(payload)
        }
        dbg(method, xhr.__dcUrl, payload.tables.map((t) => t.name).join('|'))

        const res = await fetch(xhr.__dcUrl, init)
        const text = await res.text()
        const contentType = res.headers.get('content-type') || 'text/plain'
        if (res.status >= 400) console.error('[dc-host] ' + xhr.__dcUrl + ' -> ' + res.status + ' ' + text.slice(0, 400))
        respond(xhr, res.status, contentType, text)
      })
      .catch((err) => {
        const message = String((err && err.message) || err)
        console.error('[dc-host] request failed: ' + xhr.__dcUrl + ' - ' + message)
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
  window.__dcHostStats = async () => {
    const reg = await navigator.serviceWorker.ready
    return { active: !!reg.active, controller: !!navigator.serviceWorker.controller }
  }
})()
