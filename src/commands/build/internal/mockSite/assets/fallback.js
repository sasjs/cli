/* The site's not-found page, published as 404.html.
 *
 * A static host answers a path it has no file for with 404.html and a 404
 * status. This site's backend is a service worker, and a worker only answers a
 * page it already controls - so a deep link into the site (a streamed app's
 * entry page at `<appLoc>/services/<name>.html`, a route under the API) reaches
 * the static host and gets this page. It installs the worker and asks for the
 * same address again, which the worker then answers.
 *
 * A retry can miss: the worker is active but the page that issued the
 * navigation is not controlled yet, and under load that window is wide enough
 * to swallow more than one attempt. Once the page IS controlled the next
 * navigation is certainly intercepted, so this keeps trying for a few attempts
 * and gives up when the cap is reached - at which point the address really is
 * not part of the site.
 *
 * The attempt counter is per address, not per tab: one missing link must not
 * exhaust the budget for every later deep link opened in the same tab.
 */
;(function () {
  'use strict'

  var KEY = 'sasjs-404-attempts'
  var MAX_ATTEMPTS = 3
  var WAIT_ACTIVATED_MS = 2000
  var WAIT_CONTROL_MS = 1000
  var WAIT_READY_MS = 3000

  var target = location.pathname + location.search + location.hash
  var msg = document.getElementById('msg')

  function giveUp(text) {
    msg.textContent = text
    msg.insertAdjacentHTML('afterend', '<p><a href="/">Open the site</a></p>')
  }

  function readAttempts() {
    try {
      var stored = JSON.parse(sessionStorage.getItem(KEY) || 'null')
      /* a different address starts its own count, and clears the stale one */
      if (!stored || stored.target !== target) {
        sessionStorage.setItem(KEY, JSON.stringify({ target: target, n: 0 }))
        return 0
      }
      return stored.n || 0
    } catch (e) {
      return 0
    }
  }

  function writeAttempts(n) {
    try {
      sessionStorage.setItem(KEY, JSON.stringify({ target: target, n: n }))
    } catch (e) {
      /* private mode */
    }
  }

  function delay(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms)
    })
  }

  if (!('serviceWorker' in navigator)) {
    giveUp('This browser cannot open this page from a direct link.')
    return
  }

  var attempts = readAttempts()
  if (attempts >= MAX_ATTEMPTS) {
    giveUp('This page is not part of this site.')
    return
  }

  navigator.serviceWorker
    .register('/sw.js')
    .then(function (reg) {
      /* `navigator.serviceWorker.ready` is the one promise every engine has: some
       * builds resolve `register()` with a registration whose own `ready` is
       * undefined, and reading it threw here - which looked exactly like a worker
       * that never arrives, and spent the whole attempt budget before it did.
       * The race bounds it, so a registration that never settles delays the retry
       * instead of stopping it. */
      var ready =
        navigator.serviceWorker.ready ||
        (reg && reg.ready) ||
        Promise.resolve(reg)
      return Promise.race([ready, delay(WAIT_READY_MS)]).then(
        function (registration) {
          /* an activating worker is not yet an intercepting one */
          var active = registration && registration.active
          if (!active || active.state === 'activated') return null
          return Promise.race([
            new Promise(function (resolve) {
              active.addEventListener('statechange', function () {
                if (active.state === 'activated') resolve()
              })
            }),
            delay(WAIT_ACTIVATED_MS)
          ])
        }
      )
    })
    .catch(function () {
      /* the retry below either works or the next attempt says so */
    })
    .then(function () {
      if (navigator.serviceWorker.controller) {
        writeAttempts(attempts + 1)
        location.replace(target)
        return
      }
      /* the first retry is the one that can miss: the worker is active but this
       * page is not controlled yet. Wait for control where it comes, bounded. */
      return Promise.race([
        new Promise(function (resolve) {
          navigator.serviceWorker.addEventListener(
            'controllerchange',
            resolve,
            { once: true }
          )
        }),
        delay(WAIT_CONTROL_MS)
      ]).then(function () {
        writeAttempts(attempts + 1)
        location.replace(target)
      })
    })
})()
