/*
 * The mock host's boot loader. It ships as a file rather than an inline
 * <script> because an inline one is refused by any app that sets a strict
 * Content-Security-Policy (default-src 'self' with no 'unsafe-inline' is the
 * SASjs norm), and the builder cannot add a hash or nonce to a policy it does
 * not own.
 *
 * Order: register the service worker that hosts the mock backend, wait until it
 * controls this page, hand it the persisted drive (persist.js), install the XHR
 * bridge (intercept.js), and only then replay the application's own script tags
 * - in the order the page listed them. Nothing about the app changes: it is the
 * same tags, the same order, and the same globals, just later than the parser
 * would have run them.
 *
 * The tag list arrives in the `data-scripts` attribute as JSON, written by
 * buildMockSite. `defer` and `async` are not replayed: execution is sequenced
 * on purpose here, because the host has to be ready before the first request
 * the app makes.
 *
 * The fallback ladder, because a site whose worker never claims the page fails
 * every request: an unreadable config stops before the app boots; a script that
 * fails to load is reported and the next one still runs; a worker that takes
 * control late is waited for; one that never does gets a single reload, then the
 * app boots anyway with the failure in the console; and no service worker
 * support at all boots the app in localStorage-only mode rather than a blank
 * page.
 */
;(function () {
  'use strict'

  var script = document.currentScript
  var specs = []
  try {
    specs = JSON.parse((script && script.getAttribute('data-scripts')) || '[]')
  } catch (err) {
    console.error('[mock] the boot config could not be read: ' + err)
    return
  }

  function load(src, next) {
    var s = document.createElement('script')
    s.src = src
    s.onload = next
    s.onerror = function () {
      console.error('[mock] failed to load ' + src)
      next()
    }
    document.body.appendChild(s)
  }

  /** Replay one original tag: same src, and the attributes an app can rely on. */
  function replay(spec, next) {
    var s = document.createElement('script')
    if (spec.type) s.setAttribute('type', spec.type)
    if (spec.id) s.id = spec.id
    if (spec.crossOrigin) s.crossOrigin = spec.crossOrigin
    if (spec.integrity) s.integrity = spec.integrity
    if (spec.noModule) s.noModule = true

    // an inline snippet runs synchronously on insertion, exactly as it did in
    // the page - there is no load event to wait for
    if (spec.code !== undefined && spec.src === undefined) {
      s.textContent = spec.code
      document.body.appendChild(s)
      return next()
    }

    s.src = spec.src
    s.onload = next
    s.onerror = function () {
      console.error('[mock] failed to load ' + spec.src)
      next()
    }
    document.body.appendChild(s)
  }

  function replayAll(list, done) {
    if (!list.length) return done()
    replay(list[0], function () {
      replayAll(list.slice(1), done)
    })
  }

  function start() {
    load('host/persist.js', function () {
      Promise.resolve(window.__sasjsMockReady).then(function (boot) {
        if (boot && boot.error) console.error('[mock] boot: ' + boot.error)
        load('host/intercept.js', function () {
          replayAll(specs, function () {})
        })
      })
    })
  }

  if (!('serviceWorker' in navigator)) {
    console.error(
      '[mock] service workers are unavailable - the mock backend cannot run'
    )
    start()
    return
  }

  /*
   * The worker script's own URL is the only thing a returning visitor cannot
   * bypass: the host files behind it are cache-busted with a version query, but
   * a cached sw.js keeps serving the previous build's worker - and through it
   * the previous runtime. The boot tag already carries the host version, so its
   * query string is reused rather than passing the version twice.
   */
  var stamp = ''
  try {
    stamp = new URL(script.src, location.href).search
  } catch (err) {
    stamp = ''
  }

  navigator.serviceWorker
    .register('/sw.js' + stamp, { scope: '/', updateViaCache: 'none' })
    .then(function () {
      return navigator.serviceWorker.ready
    })
    .then(function () {
      if (navigator.serviceWorker.controller) return
      return new Promise(function (resolve) {
        var timer = setTimeout(resolve, 4000)
        navigator.serviceWorker.addEventListener(
          'controllerchange',
          function () {
            clearTimeout(timer)
            resolve()
          }
        )
      })
    })
    .then(function () {
      if (navigator.serviceWorker.controller) return start()
      if (!sessionStorage.getItem('mock-sw-reloaded')) {
        sessionStorage.setItem('mock-sw-reloaded', '1')
        location.reload()
        return
      }
      console.error('[mock] no service worker controller - requests will fail')
      start()
    })
    .catch(function (err) {
      console.error('[mock] service worker registration failed: ' + err)
      start()
    })
})()
