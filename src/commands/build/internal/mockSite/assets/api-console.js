/**
 * The API console for a browser-hosted build.
 *
 * A plain page with no framework and no build step: it reads the route table the
 * build wrote into `operations.json`, renders a form per route from the
 * parameters the API declares, and sends the request the way an application
 * would - same origin, same service worker, same answers. Nothing here is a
 * second implementation of the API; a route that fails here fails for the app
 * too, which is the point of having it on a demo site.
 *
 * Three deliberate choices:
 *
 * - no innerHTML with anything that came from the API. A response body is data
 *   (it can be a CSV of a visitor's own making), so it goes into textContent.
 * - the host is started here. A visitor can land on this page directly, and the
 *   service worker is only registered by the application's boot loader - so this
 *   page registers it too, in the same shape, before it sends anything.
 * - `window.SASjsMock.as()` is how a visitor becomes another account. It returns
 *   a real token pair, and the console sends it as a bearer token, so the
 *   refusal a restricted account gets is the refusal an application gets.
 */
;(function () {
  'use strict'

  /**
   * The site's root, from the page's own URL: the console sits at `<base>/api/`,
   * and half a URL (no trailing slash) is the shape a person types.
   */
  const base = (function () {
    const path = location.pathname.replace(/\/index\.html$/, '/')
    const cut = /\/api\/?$/.exec(path)
    return cut ? path.slice(0, cut.index + 1) : '/'
  })()

  const apiUrl = (path) => base + String(path).replace(/^\/+/, '')
  const el = (id) => document.getElementById(id)

  const TOKEN_KEY = 'mock-console-token'

  /** The types the form treats as text rather than as JSON shapes. */
  const SCALAR_TYPES = ['string', 'number', 'integer', 'boolean']

  /** The parameter groups the form renders, in the order it renders them. */
  const FORM_GROUPS = ['path', 'query', 'body']

  const state = {
    operations: [],
    selected: null,
    accounts: [],
    admin: null,
    /**
     * The bearer token of the account the visitor chose to act as, if any.
     *
     * It has to survive the reload `as()` performs to apply the switch, so it
     * lives in sessionStorage for the length of that navigation - the only place
     * a page can keep something across its own restart. The worker applies the
     * subject either way; the token is what makes the calls below carry the
     * credential the API itself checks.
     */
    token: null,
    actingAs: null
  }

  // -------------------------------------------------------------- the host
  const loadScript = (src) =>
    new Promise((resolve) => {
      const script = document.createElement('script')
      script.src = src
      script.onload = resolve
      script.onerror = () => resolve(false)
      document.body.appendChild(script)
      return true
    })

  /**
   * Starts the demo backend for this page.
   *
   * The application's boot loader registers the worker; a visitor who lands on
   * `/api/` first has no loader, and every request would reach the static host
   * and 404. So: register it beside the site, wait for it to control this page,
   * then load `host/persist.js`, which is what hands the worker the drive this
   * browser already has and keeps whatever this page changes.
   *
   * The reload guard is the loader's: a worker that has not claimed the page
   * after a few seconds gets one reload, because a registration that completes
   * after the navigation commits only controls the next one.
   */
  const startHost = async () => {
    // the property, not just its presence: an environment can expose
    // `navigator.serviceWorker` as undefined, and `'serviceWorker' in navigator`
    // is true for that
    if (!navigator.serviceWorker) {
      console.warn('[api console] service workers are unavailable')
      return
    }

    // the loader on the app's page registers `<base>/sw.js?v=<version>`, and a
    // second registration for the same scope under a different URL replaces it -
    // so this asks for the same one, stamped the same way
    const stamp = document.querySelector('meta[name="sasjs-mock-version"]')
    const version = stamp && stamp.getAttribute('content')
    const workerUrl =
      new URL('sw.js', new URL(base, location.origin)).href +
      (version && version !== '__MOCK_VERSION__' ? '?v=' + version : '')

    try {
      await navigator.serviceWorker.register(workerUrl, {
        scope: base,
        updateViaCache: 'none'
      })
    } catch (e) {
      console.error('[api console] the demo host could not register: ' + e)
      return
    }

    if (!navigator.serviceWorker.controller) {
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, 4000)
        navigator.serviceWorker.addEventListener(
          'controllerchange',
          () => {
            clearTimeout(timer)
            resolve()
          },
          { once: true }
        )
      })
    }

    if (!navigator.serviceWorker.controller) {
      if (!sessionStorage.getItem('mock-console-reloaded')) {
        sessionStorage.setItem('mock-console-reloaded', '1')
        location.reload()
        return
      }
      console.error(
        '[api console] the demo host did not take control; calls may not answer'
      )
    }

    await loadScript(apiUrl('host/persist.js'))

    if (window.__sasjsMockReady) {
      try {
        await window.__sasjsMockReady
      } catch (e) {
        console.error('[api console] the drive could not be handed over: ' + e)
      }
    }
  }

  // ------------------------------------------------------------------ routes
  const loadOperations = async () => {
    const response = await fetch('operations.json', { cache: 'no-store' })
    if (!response.ok) throw new Error('operations.json is ' + response.status)
    state.operations = await response.json()
  }

  const groupOf = (operation) => operation.tag || 'Other'

  const renderList = () => {
    const filter = el('filter').value.trim().toLowerCase()
    const list = el('routes')
    list.textContent = ''
    const matches = state.operations.filter((operation) => {
      if (!filter) return true
      return (
        operation.path.toLowerCase().includes(filter) ||
        operation.method.toLowerCase().includes(filter) ||
        String(operation.summary || '')
          .toLowerCase()
          .includes(filter) ||
        groupOf(operation).toLowerCase().includes(filter)
      )
    })

    if (!matches.length) {
      const empty = document.createElement('p')
      empty.className = 'hint'
      empty.textContent = 'No route matches that.'
      list.appendChild(empty)
      return
    }

    const byTag = new Map()
    for (const operation of matches) {
      const tag = groupOf(operation)
      if (!byTag.has(tag)) byTag.set(tag, [])
      byTag.get(tag).push(operation)
    }

    for (const tag of [...byTag.keys()].sort()) {
      const heading = document.createElement('h3')
      heading.textContent = tag
      list.appendChild(heading)
      for (const operation of byTag.get(tag)) {
        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'route'
        button.dataset.id = operation.id
        if (state.selected && state.selected.id === operation.id)
          button.classList.add('active')
        const method = document.createElement('span')
        method.className = 'method ' + String(operation.method).toLowerCase()
        method.textContent = operation.method
        const path = document.createElement('span')
        path.className = 'path'
        path.textContent = String(operation.path).replace(/^\/SASjsApi/, '')
        button.appendChild(method)
        button.appendChild(path)
        button.title = operation.summary || operation.id
        button.addEventListener('click', () => select(operation))
        list.appendChild(button)
      }
    }
  }

  // ------------------------------------------------------------------- forms
  const fieldFor = (parameter, value) => {
    const wrap = document.createElement('label')
    wrap.className = 'field'
    const name = document.createElement('span')
    name.className = 'name'
    name.textContent = parameter.name
    const where = document.createElement('span')
    where.className = 'where'
    where.textContent = parameter.in + (parameter.required ? ', required' : '')
    wrap.appendChild(name)
    wrap.appendChild(where)

    let input
    if (parameter.type === 'boolean') {
      // three states rather than a checkbox, because the API reads "absent" and
      // "false" differently: every boolean in the route table is optional, and an
      // untouched `isAdmin` on PATCH /SASjsApi/user/{uid} would send `false` and
      // demote the account it was meant to leave alone
      input = document.createElement('select')
      for (const [label, optionValue] of [
        ['leave unset', ''],
        ['true', 'true'],
        ['false', 'false']
      ]) {
        const option = document.createElement('option')
        option.value = optionValue
        option.textContent = label
        input.appendChild(option)
      }
      if (value === true) input.value = 'true'
      if (value === false) input.value = 'false'
    } else {
      input = document.createElement('input')
      input.type = 'text'
      input.value = value === undefined ? '' : String(value)
      if (parameter.type && parameter.type !== 'string')
        input.placeholder = parameter.type
    }
    input.dataset.name = parameter.name
    input.dataset.in = parameter.in
    input.dataset.type = parameter.type || 'string'
    // no `required` hint: nothing submits this form, so constraint
    // validation never runs - `send()` checks the required fields instead
    wrap.appendChild(input)
    return wrap
  }

  /**
   * A value to start a field with.
   *
   * The login route is prefilled from the fixture the build shipped: the demo
   * accounts are published so a visitor can recover from a logout, and typing
   * them from a page that already lists them is busywork.
   */
  const initialValue = (operation, parameter) => {
    if (operation.id !== 'POST /SASLogon/login' || !state.admin)
      return undefined
    if (parameter.name === 'username') return state.admin.username
    if (parameter.name === 'password') return state.admin.password
    return undefined
  }

  const select = (operation) => {
    state.selected = operation
    // the route goes in the URL: acting as another account reloads the page (the
    // host restarts so every screen redraws), and a visitor should come back to
    // the route they were trying rather than to an empty console
    try {
      history.replaceState(
        null,
        '',
        '?route=' + encodeURIComponent(operation.id)
      )
    } catch (e) {
      /* a page that cannot rewrite its URL still works */
    }
    renderList()
    el('empty').hidden = true
    el('route').hidden = false
    el('title').textContent = operation.method + ' ' + operation.path
    el('summary').textContent =
      (operation.summary || '') +
      (operation.implemented === false
        ? '  (this host does not implement this route)'
        : '')

    const form = el('form')
    form.textContent = ''
    const params = operation.params || []
    let rendered = 0
    for (const where of FORM_GROUPS) {
      const inGroup = params.filter((parameter) => parameter.in === where)
      if (!inGroup.length) continue
      const fieldset = document.createElement('fieldset')
      const legend = document.createElement('legend')
      legend.textContent = where === 'body' ? 'JSON body' : where
      fieldset.appendChild(legend)
      for (const parameter of inGroup) {
        fieldset.appendChild(
          fieldFor(parameter, initialValue(operation, parameter))
        )
        rendered++
      }
      form.appendChild(fieldset)
    }

    if (!rendered) {
      const none = document.createElement('p')
      none.className = 'hint'
      none.textContent = 'This route takes no parameters.'
      form.appendChild(none)
    }

    if ((operation.requestBodies || []).includes('multipart/form-data')) {
      const note = document.createElement('p')
      note.className = 'hint warn'
      note.textContent =
        'This route takes a file upload, which this console does not send. Use the application, or a client of your own.'
      form.appendChild(note)
    }

    el('response').hidden = true
    el('timing').textContent = ''
  }

  // ------------------------------------------------------------------ sending
  const valuesOf = () => {
    const values = { path: {}, query: {}, body: {} }
    for (const input of el('form').querySelectorAll('[data-name]')) {
      const name = input.dataset.name
      const where = input.dataset.in
      const type = input.dataset.type
      let value
      if (type === 'boolean') {
        // untouched means absent: an optional boolean the visitor never chose is
        // left out of the body rather than sent as `false`
        if (String(input.value) === '') continue
        value = input.value === 'true'
      } else {
        if (String(input.value).trim() === '') continue
        value = input.value
        if (type === 'number' || type === 'integer') {
          value = Number(value)
          // JSON.stringify writes NaN as null, so a typo would reach the host as
          // a missing field and its refusal would read as a host fault
          if (!Number.isFinite(value)) {
            const err = new Error(name + ' must be a number')
            err.invalid = true
            throw err
          }
        } else if (!SCALAR_TYPES.includes(type)) {
          // A named, non-scalar type is a shape: `FileTree` on POST
          // /SASjsApi/drive/deploy is refused by the package when it arrives as a
          // string ("Provided not supported data format"). An enum (`RunTimeType`,
          // `PermissionSettingForRoute`) is a plain word and never parses to an
          // object, so it stays the string that was typed. `object` and `array`
          // insist on valid JSON.
          let parsed
          let shape = false
          try {
            parsed = JSON.parse(value)
            shape = parsed !== null && typeof parsed === 'object'
          } catch (e) {
            if (type === 'object' || type === 'array') {
              const err = new Error(name + ' must be JSON: ' + e.message)
              err.invalid = true
              throw err
            }
          }
          if (shape) value = parsed
          else if (type === 'object' || type === 'array') {
            const err = new Error(name + ' must be JSON')
            err.invalid = true
            throw err
          }
        }
      }
      values[where][name] = value
    }
    return values
  }

  const buildUrl = (operation, values) => {
    let path = operation.path
    for (const [name, value] of Object.entries(values.path))
      path = path.replace('{' + name + '}', encodeURIComponent(value))
    const url = apiUrl(path)
    const search = new URLSearchParams()
    for (const [name, value] of Object.entries(values.query))
      // an object or array on the query goes as JSON: `append` would write
      // `[object Object]` (or a comma-joined array) and the host's 400 would read
      // as its fault
      search.append(
        name,
        value !== null && typeof value === 'object'
          ? JSON.stringify(value)
          : value
      )
    const text = search.toString()
    return text ? url + '?' + text : url
  }

  const send = async () => {
    const operation = state.selected
    if (!operation) return
    el('send').disabled = true
    el('timing').textContent = 'sending...'
    const started = performance.now()
    try {
      const values = valuesOf()
      // a blank required parameter would otherwise be sent as the placeholder
      // itself - a literal `{sessionId}` in the path - and the 404 that came back
      // would look like the host's fault
      const missing = (operation.params || [])
        // a form-only field (`formData`, an upload) has no input on this page, so
        // requiring it would ask for something the visitor cannot give
        .filter((parameter) => FORM_GROUPS.includes(parameter.in))
        .filter((parameter) => parameter.required)
        .filter(
          (parameter) =>
            !values[parameter.in] ||
            values[parameter.in][parameter.name] === undefined
        )
        .map((parameter) => parameter.name)
      if (missing.length) {
        el('status').textContent = 'missing input'
        el('status').className = 'status bad'
        el('timing').textContent = ''
        el('body').textContent =
          'This route needs ' +
          missing.join(', ') +
          '. Fill the field' +
          (missing.length > 1 ? 's' : '') +
          ' in and send again.'
        el('response').hidden = false
        return
      }
      const url = buildUrl(operation, values)
      const init = { method: operation.method, headers: {} }
      if (state.token) init.headers.authorization = 'Bearer ' + state.token
      // a GET or HEAD with a body is refused by fetch itself, and the TypeError
      // would read as the host's answer
      const carriesBody =
        operation.method !== 'GET' &&
        operation.method !== 'HEAD' &&
        Object.keys(values.body).length > 0
      if (carriesBody) {
        init.headers['content-type'] = 'application/json'
        init.body = JSON.stringify(values.body)
      }
      const response = await fetch(url, init)
      const elapsed = Math.round(performance.now() - started)
      const text = await response.text()
      el('status').textContent = response.status + ' ' + response.statusText
      el('status').className = 'status ' + (response.ok ? 'ok' : 'bad')
      el('timing').textContent =
        elapsed +
        'ms ' +
        'as ' +
        (state.actingAs || (state.admin ? state.admin.username : 'this host'))
      el('body').textContent = prettyOf(
        text,
        response.headers.get('content-type')
      )
      el('response').hidden = false
    } catch (e) {
      // a value this page refused is the visitor's input, not the host's answer
      el('status').textContent =
        e && e.invalid ? 'invalid input' : 'request failed'
      el('status').className = 'status bad'
      el('body').textContent = (e && e.message) || String(e)
      el('response').hidden = false
      el('timing').textContent = ''
    } finally {
      el('send').disabled = false
    }
  }

  const prettyOf = (text, contentType) => {
    if (!text) return '(empty body)'
    if ((contentType || '').includes('json')) {
      try {
        return JSON.stringify(JSON.parse(text), null, 2)
      } catch (e) {
        /* not JSON after all: show it as it came */
      }
    }
    return text.length > 20000
      ? text.slice(0, 20000) +
          '\n... (' +
          (text.length - 20000) +
          ' more bytes)'
      : text
  }

  // ---------------------------------------------------------------- accounts
  /**
   * The accounts the build shipped, shown so a visitor can sign in to the
   * application and knows how to get back in after logging out.
   *
   * They are not a secret: `host/identity.json` is served by the site, and a
   * browser-hosted build has no login wall to protect. A project that ships its
   * own fixture sees its own accounts here.
   */
  const loadAccounts = async () => {
    try {
      const response = await fetch(apiUrl('host/identity.json'), {
        cache: 'no-store'
      })
      if (!response.ok) return
      const fixture = await response.json()
      state.accounts = (fixture && fixture.users) || []
      // the account whose credentials are published and offered back: an admin if
      // the fixture ships one, otherwise the first account - and the page says
      // which, because a fixture without an admin is a project's choice and its
      // first user is not one
      const administrator = state.accounts.find((user) => user.isAdmin)
      state.admin = administrator || state.accounts[0] || null
      state.adminIsAdministrator = Boolean(administrator)
      await adoptStoredSubject()
      setWho()
      renderAccounts()
    } catch (e) {
      /* a site with no fixture simply shows nothing here */
    }
  }

  /**
   * The account this page is already answered as.
   *
   * `as()` reloads the page and stores the subject, and the worker answers as it
   * from then on - so the console has to read that back, or it would label a
   * restricted session as the administrator.
   */
  const adoptStoredSubject = async () => {
    if (!window.SASjsMock || !window.SASjsMock.identity) return
    try {
      const stored = await window.SASjsMock.identity()
      const subject = stored && stored.subject
      if (subject && (!state.admin || subject !== state.admin.username))
        state.actingAs = subject
    } catch (e) {
      /* no stored identity: the host answers as its fixture administrator */
    }
  }

  const setWho = () => {
    const who = el('who')
    if (state.actingAs) {
      who.textContent = 'acting as ' + state.actingAs
      who.classList.add('acting')
      return
    }
    who.classList.remove('acting')
    who.textContent = state.admin
      ? 'answering as ' + state.admin.username
      : 'connected'
  }

  const actAs = async (username) => {
    if (!window.SASjsMock || !window.SASjsMock.as) return
    try {
      const pair = await window.SASjsMock.as(username)
      // `as()` schedules the reload on a 0ms timer and resolves first, so this
      // runs before the page goes away: storing the pair here is what makes the
      // calls on the far side carry a credential
      const target = username || (state.admin && state.admin.username) || null
      // returning to the administrator is not "acting as" anyone: the host
      // answers as them already, and a header would just be a credential for the
      // account the fixture starts with
      const backToAdmin = Boolean(
        state.admin && target === state.admin.username
      )
      const token =
        !backToAdmin && pair && pair.accessToken ? pair.accessToken : null
      try {
        if (token) sessionStorage.setItem(TOKEN_KEY, token)
        else sessionStorage.removeItem(TOKEN_KEY)
      } catch (e) {
        /* a page that refuses storage still has the worker's subject */
      }
      state.token = token
      state.actingAs = backToAdmin ? null : target
    } catch (e) {
      state.token = null
      state.actingAs = null
      alert('Could not act as that account: ' + e.message)
    }
    setWho()
    renderAccounts()
  }

  const renderAccounts = () => {
    const host = el('accounts')
    if (!host || !state.accounts.length) return
    host.textContent = ''

    const heading = document.createElement('h3')
    heading.textContent = 'Demo accounts'
    host.appendChild(heading)
    const note = document.createElement('p')
    note.className = 'hint'
    note.textContent =
      'This is a browser demo, so these are published on purpose. Use them to ' +
      'sign in to the application. "Act as" sends every call below with that ' +
      "account's token, which is how the refusals a restricted user gets are shown."
    if (!state.adminIsAdministrator && state.admin)
      // the fixture decides who exists; saying which account is standing in keeps
      // the page from calling an ordinary user an administrator
      note.textContent +=
        ' This fixture ships no administrator, so the page names ' +
        state.admin.username +
        ' wherever it would say "the demo administrator".'
    host.appendChild(note)

    const table = document.createElement('table')
    for (const user of state.accounts) {
      const row = document.createElement('tr')
      const name = document.createElement('td')
      name.textContent = user.username
      const password = document.createElement('td')
      password.textContent = user.password || '(none)'
      const role = document.createElement('td')
      role.textContent = user.isAdmin ? 'admin' : 'user'
      const action = document.createElement('td')
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'link'
      button.dataset.user = user.username
      const isCurrent = state.actingAs === user.username
      button.textContent = isCurrent ? 'acting as this' : 'Act as'
      button.disabled = isCurrent
      button.addEventListener('click', () => actAs(user.username))
      action.appendChild(button)
      row.appendChild(name)
      row.appendChild(password)
      row.appendChild(role)
      row.appendChild(action)
      table.appendChild(row)
    }
    host.appendChild(table)

    if (state.actingAs) {
      const back = document.createElement('button')
      back.type = 'button'
      back.className = 'link'
      back.textContent = state.adminIsAdministrator
        ? 'Back to the demo administrator'
        : 'Back to ' + (state.admin ? state.admin.username : 'this host')
      back.addEventListener('click', () => actAs())
      host.appendChild(back)
    }
  }

  // ------------------------------------------------------------------ restart
  /**
   * Deletes the demo's database, and waits for the delete to finish.
   *
   * A delete blocked by an open connection - the host keeps one while a request
   * runs - completes after whatever the page does next, so a page that navigates
   * immediately comes back to the drive it asked to clear.
   */
  const deleteDriveDatabase = () =>
    new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase('sasjs-mock-host')
      request.onsuccess = () => resolve()
      request.onerror = () =>
        reject(request.error || new Error('the drive could not be deleted'))
      request.onblocked = () =>
        reject(
          new Error(
            'the demo host still holds the drive; close its other tabs and try again'
          )
        )
    })

  /**
   * `?reset=1` starts the demo again from the state the build ships.
   *
   * The drive lives in IndexedDB, and the worker is what reseeds it, so the
   * honest reset is the host's own: `SASjsMock.reset()` clears the stored drive
   * and seeds it from the snapshot, then the page reloads onto a clean console. A
   * browser's "hard refresh" does NOT do this - it bypasses the HTTP cache only -
   * which is why there is a link for it.
   */
  const resetIfAsked = async () => {
    // `=1` exactly: the page tells the visitor `?reset=1`, and `?reset=0` is the
    // one thing someone will type to say "not now"
    if (new URLSearchParams(location.search).get('reset') !== '1') return false
    try {
      if (window.SASjsMock && window.SASjsMock.reset)
        await window.SASjsMock.reset()
      else await deleteDriveDatabase()
      sessionStorage.clear()
      localStorage.removeItem('sasjs-mock-build')
    } catch (e) {
      // the drive is unchanged, so replacing the page would come straight back to
      // it and look like the flag did nothing
      console.error('[api console] reset failed: ' + e)
      el('routes').textContent =
        'The demo could not be reset: ' + ((e && e.message) || e)
      return true
    }
    location.replace(base + 'api/')
    return true
  }

  // ------------------------------------------------------------------- start
  const start = async () => {
    try {
      state.token = sessionStorage.getItem(TOKEN_KEY) || null
    } catch (e) {
      state.token = null
    }
    el('filter').addEventListener('input', renderList)
    el('send').addEventListener('click', send)
    el('copy').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(el('body').textContent)
        el('copy').textContent = 'Copied'
        setTimeout(() => (el('copy').textContent = 'Copy'), 1200)
      } catch (e) {
        /* clipboard refused: the text is on screen and selectable */
      }
    })

    await startHost()
    if (await resetIfAsked()) return

    await Promise.all([loadOperations(), loadAccounts()])
    renderList()

    const wanted = new URLSearchParams(location.search).get('route')
    const chosen = wanted
      ? state.operations.find((operation) => operation.id === wanted)
      : undefined
    if (chosen) select(chosen)
  }

  start().catch((e) => {
    const list = el('routes')
    if (list) list.textContent = 'The console could not start: ' + e.message
  })
})()
