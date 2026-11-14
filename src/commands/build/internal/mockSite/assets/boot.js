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
 * Two of those start before the worker is ready, because neither needs it: the
 * drive restore is the page's own read of IndexedDB and is handed over as soon
 * as there is a worker, and the app's bundle is hinted by the page (a preload
 * link the builder writes). Both then overlap the install instead of following
 * it.
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

  /*
   * The drive restore is the page's own work: persist.js reads the stored drive
   * and hands it to the worker as soon as there is one, so it neither needs nor
   * waits for the registration below. Started here, its download and its
   * IndexedDB read overlap the worker's install, which is the slowest part of a
   * first visit - sequenced after it, they are two more round trips on top.
   */
  var persist = new Promise(function (resolve) {
    load('host/persist.js', resolve)
  })

  function start() {
    persist.then(function () {
      Promise.resolve(window.__sasjsMockReady).then(function (boot) {
        if (boot && boot.error) console.error('[mock] boot: ' + boot.error)
        // the drive was restored from less than the whole capture: the page still runs,
        // but every file it did not already hold will read as missing, and nothing else
        // says so
        if (boot && boot.driveError)
          console.error('[mock] drive: ' + boot.driveError)
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

  // Registered against the loader's own URL, which sits in <base>/host/, and
  // scoped to the folder above it: the site is served from the origin root on
  // one host and from a folder on another (a demonstration site beside its own
  // docs). The page cannot be the reference - at `<base>` with no trailing
  // slash a page-relative URL names the origin root, and './' resolves to '/',
  // which is the mis-registration this is here to avoid.
  //
  // The tag the build emits is absolute (`<base>/host/boot.js`) when the target
  // names a folder, and relative (`host/boot.js`) when it does not - so a site
  // published in a folder without naming it depends on its own URL ending in a
  // slash - and in both cases the loader's own URL then carries `<base>`. The
  // fallback below is for the case where there is no currentScript to read.
  var loaderSrc = (script && script.src) || loaderUrl()

  // The loader always sits in <base>/host/, so without a currentScript the page
  // still names the base. A path that does not end in a slash is ambiguous: it
  // is the folder when its last segment has no dot (`/demo`), and a file when it
  // does (`/demo/index.html`) - only the second has a segment to drop.
  // `location.href` cannot do this: one level above `/demo` is the origin root.
  function loaderUrl() {
    var page = location.pathname
    var lastSegment = page.slice(page.lastIndexOf('/') + 1)
    var base

    if (lastSegment.indexOf('.') === -1) {
      base = page.charAt(page.length - 1) === '/' ? page : page + '/'
    } else {
      base = page.slice(0, page.lastIndexOf('/') + 1)
    }

    return location.origin + base + 'host/boot.js'
  }
  navigator.serviceWorker
    .register(new URL('../sw.js' + stamp, loaderSrc).href, {
      scope: new URL('../', loaderSrc).pathname,
      updateViaCache: 'none'
    })
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
