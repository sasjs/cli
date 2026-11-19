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
 * The attempt count has to survive the retry, and the retry is a navigation:
 * every load of this page is a new document. A cookie carries it, and where a
 * cookie cannot be written (private mode, cookies disabled for the origin) the
 * count travels in the URL instead - a counter that storage can silently drop
 * is a counter that bounds nothing, and the failure mode there is a reload loop
 * rather than a message. It is per address, so one bad link cannot spend a
 * later link's budget.
 *
 * The URL carrier is only used while no worker controls the page: once one
 * does, the next navigation is answered, so the count is not needed and the
 * address stays the one that was asked for. The marker can still reach a
 * visitor by being copied out of the address bar of a page that was retrying;
 * the give-up branch strips it, so the address they can share or reload is
 * clean, and a reload is one real attempt.
 */
;(function () {
  'use strict'

  var PARAM = 'sasjs404'
  var COOKIE = 'sasjs404'
  var MAX_ATTEMPTS = 3
  var WAIT_READY_MS = 3000
  var WAIT_ACTIVATED_MS = 2000
  var WAIT_CONTROL_MS = 1000
  var MAX_AGE_SECONDS = 300

  var here = new URL(location.href)
  var msg = document.getElementById('msg')

  /* the address that was asked for, without the marker this page adds */
  var fromUrl = Number(here.searchParams.get(PARAM))
  /* read before the marker is taken off: the give-up branch asks whether this
   * address carried one, and after the delete it no longer does */
  var marked = here.searchParams.has(PARAM)
  here.searchParams.delete(PARAM)
  var target = here.pathname + here.search + here.hash

  function recordOf(value) {
    try {
      var stored = JSON.parse(value || 'null')
      /* a different address starts its own count */
      if (!stored || stored.target !== target) return stored ? 0 : null
      return Number(stored.n) || 0
    } catch (e) {
      return null
    }
  }

  function readCookie() {
    var match = document.cookie.match(
      new RegExp('(?:^|;\\s*)' + COOKIE + '=([^;]*)')
    )
    if (!match) return null
    return recordOf(decodeURIComponent(match[1]))
  }

  function writeCookie(n) {
    try {
      document.cookie =
        COOKIE +
        '=' +
        encodeURIComponent(JSON.stringify({ target: target, n: n })) +
        ';path=/;max-age=' +
        MAX_AGE_SECONDS +
        ';SameSite=Lax'
      return readCookie() === n
    } catch (e) {
      return false
    }
  }

  /* The second carrier is the window's name: it belongs to the browsing
   * context, so the retry's navigation cannot lose it, and no storage policy
   * can refuse it the way a cookie policy can. Only the last resort is the
   * address itself, because a count written there is a count a visitor can
   * copy and hand to someone else. */
  function readName() {
    try {
      return recordOf(window.name)
    } catch (e) {
      return null
    }
  }

  function writeName(n) {
    try {
      window.name = JSON.stringify({ target: target, n: n })
      return readName() === n
    } catch (e) {
      return false
    }
  }

  function giveUp(text) {
    /* the tab is not loading anything, and a title that says it is outlives the
     * message for as long as the visitor leaves it open */
    document.title = 'Page not found'
    msg.textContent = text
    /* the one link a stranded visitor is offered has to be the site's own
     * folder, which is not the host root when the site is mounted under a base
     * path */
    msg.insertAdjacentHTML(
      'afterend',
      '<p><a href="__BASE__/">Open the site</a></p>'
    )
    /* the cap bounds this visit's retries, not the address: leaving the count
     * behind would refuse the address on every reload until the cookie expires
     * (or, with window.name carrying it, until the tab is closed) - and a
     * worker still installing, or a deploy caught mid-flight, is exactly the
     * case this page exists to retry. Only our own record is cleared: an app
     * that puts its own value in window.name keeps it. */
    try {
      document.cookie = COOKIE + '=;path=/;max-age=0;SameSite=Lax'
    } catch (e) {
      /* nothing to clear where nothing could be written */
    }
    if (readName() !== null) {
      try {
        window.name = ''
      } catch (e) {
        /* a barred assignment leaves the record; the message is unaffected */
      }
    }
    /* a count carried in the address is a retry's, not this visitor's: drop it,
     * so what they copy or reload is the address they followed */
    if (marked) {
      try {
        history.replaceState({}, '', here.pathname + here.search + here.hash)
      } catch (e) {
        /* a barred replaceState leaves the marker; the message is unaffected */
      }
    }
  }

  function delay(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms)
    })
  }

  var attempts = fromUrl > 0 ? fromUrl : readCookie() || readName() || 0

  if (!('serviceWorker' in navigator)) {
    giveUp('This browser cannot open this page from a direct link.')
    return
  }
  if (attempts >= MAX_ATTEMPTS) {
    giveUp('This page is not part of this site.')
    return
  }

  navigator.serviceWorker
    .register('__BASE__/sw.js?v=__HOST_VERSION__', {
      updateViaCache: 'none'
    })
    .then(function (reg) {
      /* `navigator.serviceWorker.ready` is the one promise every engine has:
       * some builds resolve `register()` with a registration whose own `ready`
       * is undefined, and reading it threw - which looked exactly like a worker
       * that never arrives, and spent the whole attempt budget before it did.
       * The race bounds it, so a registration that never settles delays the
       * retry instead of stopping it. */
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
      var controlled = navigator.serviceWorker.controller !== null
      var waited = controlled
        ? Promise.resolve()
        : Promise.race([
            new Promise(function (resolve) {
              navigator.serviceWorker.addEventListener(
                'controllerchange',
                resolve,
                {
                  once: true
                }
              )
            }),
            delay(WAIT_CONTROL_MS)
          ])
      return waited.then(function () {
        var next = attempts + 1
        /* the carriers that keep the address clean come first; the address
         * itself is the one that cannot be refused, and the one that follows a
         * copied link. Every path increments: a retry that does not count is
         * the loop this page exists to stop. */
        if (writeCookie(next) || writeName(next)) {
          location.replace(target)
          return
        }
        var retry = new URL(location.href)
        retry.searchParams.set(PARAM, String(next))
        location.replace(retry.pathname + retry.search + retry.hash)
      })
    })
})()
