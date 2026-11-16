/*
 * Start the mock host without taking the application's scripts away from the
 * parser. Apps can await __sasjsMockReady before calling the backend; rendering
 * and native DOMContentLoaded/load events do not wait for the worker.
 */
;(function () {
  'use strict'

  // Publish before starting any asynchronous work. The internal catch marks the
  // rejection handled even when an app does not await it; the public promise
  // itself still rejects for callers that do.
  var resolveReady, rejectReady
  var ready = new Promise(function (resolve, reject) {
    resolveReady = resolve
    rejectReady = reject
  })
  window.__sasjsMockReady = ready
  ready.catch(function (err) {
    console.error('[mock] host initialization failed: ' + err)
  })

  var script = document.currentScript
  function loaderUrl() {
    var page = location.pathname
    var lastSegment = page.slice(page.lastIndexOf('/') + 1)
    var base =
      lastSegment.indexOf('.') === -1
        ? page.charAt(page.length - 1) === '/'
          ? page
          : page + '/'
        : page.slice(0, page.lastIndexOf('/') + 1)
    return location.origin + base + 'host/boot.js'
  }

  try {
    var loaderSrc = (script && script.src) || loaderUrl()
    var timeout = 20000

    function bounded(promise, label) {
      return new Promise(function (resolve, reject) {
        var timer = setTimeout(function () {
          reject(new Error(label + ' timed out'))
        }, timeout)
        Promise.resolve(promise).then(
          function (value) {
            clearTimeout(timer)
            resolve(value)
          },
          function (err) {
            clearTimeout(timer)
            reject(err)
          }
        )
      })
    }

    // A dynamically inserted external script delays window's native load event,
    // even when async. Defer only those scripts until load has fired; worker
    // registration starts immediately and apps can render or await ready in load
    // listeners. A late-injected loader schedules a task so it is safe even in
    // the brief interval between readyState=complete and dispatching load.
    var pageLoaded = new Promise(function (resolve, reject) {
      if (document.readyState === 'complete') {
        setTimeout(resolve, 0)
      } else {
        var timer = setTimeout(function () {
          window.removeEventListener('load', loaded)
          reject(new Error('page load timed out'))
        }, timeout)
        function loaded() {
          clearTimeout(timer)
          resolve()
        }
        window.addEventListener('load', loaded, { once: true })
      }
    })
    // A synchronous setup error can prevent load() from consuming this promise.
    pageLoaded.catch(function () {})

    function load(name) {
      // Reuse the boot tag's build stamp so cached older host scripts cannot
      // replace the readiness contract or install a stale bridge.
      var stamp = new URL(loaderSrc, location.href).search
      var url = new URL(name + stamp, loaderSrc).href
      return pageLoaded.then(function () {
        return bounded(
          new Promise(function (resolve, reject) {
            var element = document.createElement('script')
            element.src = url
            element.onload = resolve
            element.onerror = function () {
              reject(new Error('failed to load ' + url))
            }
            ;(document.head || document.documentElement).appendChild(element)
          }),
          url
        )
      })
    }

    function controller(expectedUrl) {
      var sw = navigator.serviceWorker
      return new Promise(function (resolve, reject) {
        var timer = setTimeout(function () {
          sw.removeEventListener('controllerchange', changed)
          reject(new Error('service worker controller timed out'))
        }, timeout)
        function changed() {
          if (!sw.controller || sw.controller.scriptURL !== expectedUrl) return
          clearTimeout(timer)
          sw.removeEventListener('controllerchange', changed)
          resolve(sw.controller)
        }
        sw.addEventListener('controllerchange', changed)
        changed()
      })
    }

    function register() {
      if (!navigator.serviceWorker)
        return Promise.reject(new Error('service workers are unavailable'))
      try {
        var stamp = new URL(loaderSrc, location.href).search
        var workerUrl = new URL('../sw.js' + stamp, loaderSrc).href
        return bounded(
          navigator.serviceWorker.register(workerUrl, {
            scope: new URL('../', loaderSrc).pathname,
            updateViaCache: 'none'
          }),
          'service worker registration'
        )
          .then(function () {
            return bounded(
              navigator.serviceWorker.ready,
              'service worker readiness'
            )
          })
          .then(function () {
            return controller(workerUrl)
          })
      } catch (err) {
        return Promise.reject(err)
      }
    }

    // Persistence must talk to the worker for this build, not a previous
    // controller that remains active while the new worker is installing.
    var registration = register()
    var persistence = navigator.serviceWorker
      ? registration
          .then(function () {
            return load('persist.js')
          })
          .then(function () {
            var persistReady = window.__sasjsMockPersistReady
            if (!persistReady || typeof persistReady.then !== 'function')
              throw new Error('persist readiness promise is missing')
            return bounded(persistReady, 'persist readiness')
          })
          .then(function (result) {
            if (!result) throw new Error('persist returned no boot result')
            var failure =
              result.error ||
              result.driveError ||
              (result.boot && result.boot.driveError)
            if (failure) throw new Error(failure)
            if (
              result.type !== 'sasjs-seed-ack' &&
              result.type !== 'sasjs-load-ack'
            )
              throw new Error('invalid drive acknowledgement')
            return result
          })
      : Promise.reject(new Error('service workers are unavailable'))
    var intercept = Promise.resolve()
      .then(function () {
        return load('intercept.js')
      })
      .then(function () {
        if (!window.__sasjsMockBridgeInstalled)
          throw new Error('intercept bridge did not install')
      })
    Promise.all([persistence, intercept, registration]).then(function (
      results
    ) {
      if (navigator.serviceWorker.controller !== results[2]) {
        rejectReady(new Error('service worker controller changed during boot'))
        return
      }
      resolveReady(results[0])
    }, rejectReady)
  } catch (err) {
    rejectReady(err)
  }
})()
