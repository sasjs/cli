/**
 * @jest-environment jsdom
 */
import fs from 'fs'
import path from 'path'

export {}

/**
 * The API console, as a page.
 *
 * The build's own specs prove the files are written and that the operations come
 * from the route table; they cannot prove the page works. This one drives it in a
 * DOM: it loads the real `api-index.html` (so a rename of an id fails here rather
 * than in a browser), stubs the two files the page reads and the host bridge, and
 * asserts the request a form sends - including the bearer token, which is the
 * part that has to survive the reload `as()` performs.
 *
 * The service worker is deliberately absent: jsdom has none, and the page has to
 * render without it (a site whose `host/persist.js` cannot load must still show
 * the route list).
 */

const page = () =>
  fs.readFileSync(
    path.join(__dirname, '..', 'assets', 'api-index.html'),
    'utf8'
  )

const bodyOf = (html: string) => {
  const start = html.indexOf('<body>')
  const end = html.indexOf('</body>')
  return start < 0 || end < 0 ? html : html.slice(start + 6, end)
}

const operations = [
  {
    id: 'POST /SASjsApi/user',
    method: 'POST',
    path: '/SASjsApi/user',
    tag: 'User',
    summary: 'Create a user',
    params: [
      { name: 'username', in: 'body', required: true, type: 'string' },
      { name: 'password', in: 'body', required: true, type: 'string' },
      { name: 'isAdmin', in: 'body', required: false, type: 'boolean' }
    ],
    requestBodies: ['application/json'],
    responses: [{ status: 200, description: 'Ok' }],
    implemented: true
  },
  {
    id: 'GET /SASjsApi/user',
    method: 'GET',
    path: '/SASjsApi/user',
    tag: 'User',
    summary: 'List all users',
    params: [],
    requestBodies: [],
    responses: [{ status: 200, description: 'Ok' }],
    implemented: true
  }
]

const fixture = {
  format: 1,
  users: [
    {
      uid: 'user-admin',
      username: 'sasjsadmin',
      password: 'Orion123',
      isAdmin: true
    },
    {
      uid: 'user-restricted',
      username: 'sasjsuser',
      password: 'Orion123',
      isAdmin: false
    }
  ]
}

const jsonResponse = (body: any) => ({
  ok: true,
  status: 200,
  statusText: 'OK',
  headers: { get: () => 'application/json' },
  json: async () => body,
  text: async () => JSON.stringify(body)
})

/** A service worker the page can register, and drive by hand. */
const withServiceWorker = (options: { registerFails?: boolean } = {}) => {
  const listeners: (() => void)[] = []
  const sw: any = {
    controller: null,
    register: jest.fn(async () => {
      if (options.registerFails) throw new Error('the browser refused')
      return {}
    }),
    addEventListener: (type: string, fn: () => void) => {
      if (type === 'controllerchange') listeners.push(fn)
    }
  }
  Object.defineProperty(navigator, 'serviceWorker', {
    value: sw,
    configurable: true
  })
  return {
    sw,
    takeControl: () => {
      sw.controller = {}
      listeners.forEach((fn) => fn())
    }
  }
}

/**
 * Records the scripts the page asks for, and answers each one.
 *
 * jsdom does not fetch a script it is given, so the load event is dispatched
 * here - otherwise the page would wait forever for `persist.js`.
 */
const stubScripts = () => {
  const realCreate = document.createElement.bind(document)
  const requested: string[] = []
  jest.spyOn(document, 'createElement').mockImplementation((tag: any) => {
    const node = realCreate(tag)
    if (String(tag).toLowerCase() === 'script') {
      setTimeout(() => {
        requested.push((node as HTMLScriptElement).src)
        node.dispatchEvent(new Event('load'))
      }, 0)
    }
    return node
  })
  return { requested }
}

/** Boots the page against a stubbed host and returns what it asked for. */
/** Waits for the render an assertion depends on, rather than for a wall clock. */
const settle = async (check: () => boolean) => {
  for (let i = 0; i < 400; i++) {
    if (check()) return
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  throw new Error('the page did not reach the state the case expected')
}

const loadConsole = async (
  before: () => void = () => {},
  table: any = operations,
  identity: any = fixture
) => {
  jest.resetModules()
  document.body.innerHTML = bodyOf(page())
  // the version lives in the head, so the cases that care about it set it there
  document.head.innerHTML = ''
  before()

  const calls: { url: string; init: any }[] = []
  ;(global as any).fetch = jest.fn(async (url: string, init: any = {}) => {
    if (String(url).includes('operations.json')) return jsonResponse(table)
    if (String(url).includes('identity.json')) return jsonResponse(identity)
    calls.push({ url: String(url), init })
    return jsonResponse({ created: true })
  })

  require('../assets/api-console.js')

  // the page loads its data in an effect; wait for the list rather than a sleep
  for (let i = 0; i < 200; i++) {
    if (document.querySelectorAll('#routes .route').length) break
    await new Promise((resolve) => setTimeout(resolve, 5))
  }

  return { calls }
}

const selectRoute = async (id: string) => {
  const button = [...document.querySelectorAll('#routes .route')].find(
    (candidate) => (candidate as HTMLElement).dataset.id === id
  ) as HTMLButtonElement
  button.click()
  await new Promise((resolve) => setTimeout(resolve, 5))
}

const fill = (name: string, value: string) => {
  const input = document.querySelector(
    `#form [data-name="${name}"]`
  ) as HTMLInputElement
  input.value = value
}

const sendAndWait = async (calls: { url: string; init: any }[], want = 1) => {
  ;(document.getElementById('send') as HTMLButtonElement).click()
  for (let i = 0; i < 200; i++) {
    if (calls.length >= want) return
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
}

describe('the API console', () => {
  afterEach(() => {
    delete (navigator as any).serviceWorker
    delete (window as any).__sasjsMockReady
  })

  beforeEach(() => {
    // jsdom has no service worker, and the page says so on the console; that is
    // the path under test, not a warning worth printing
    jest.spyOn(console, 'warn').mockImplementation(() => {})
    jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    jest.restoreAllMocks()
    delete (global as any).fetch
    delete (global as any).SASjsMock
    sessionStorage.clear()
  })

  it('lists the operations it was built with, grouped by tag', async () => {
    await loadConsole()

    const routes = [...document.querySelectorAll('#routes .route')]
    expect(routes).toHaveLength(2)
    expect(document.querySelector('#routes h3')!.textContent).toBe('User')
  })

  it('sends the route it was given, with the parameters typed into the form', async () => {
    const { calls } = await loadConsole()
    await selectRoute('POST /SASjsApi/user')

    fill('username', 'demo_reviewer')
    fill('password', 'Orion123')
    await sendAndWait(calls)

    expect(calls[0].url).toMatch(/\/SASjsApi\/user$/)
    expect(calls[0].init.method).toBe('POST')
    // an untouched optional boolean is absent: the API reads `false` as a value
    // it must act on, so sending it would change what was not asked for
    expect(JSON.parse(calls[0].init.body)).toEqual({
      username: 'demo_reviewer',
      password: 'Orion123'
    })
    expect(calls[0].init.headers.authorization).toBeUndefined()

    // the answer is rendered after the request settles
    for (let i = 0; i < 200; i++) {
      if (
        (document.getElementById('status')!.textContent || '').includes('200')
      )
        break
      await new Promise((resolve) => setTimeout(resolve, 5))
    }
    expect(document.getElementById('status')!.textContent).toContain('200')
  })

  it('sends the token the host issued for the account it is acting as', async () => {
    // `as()` reloads the page, so the console reads the pair it stored before the
    // navigation: a token held only in memory would be gone by the time the form
    // is usable again
    sessionStorage.setItem('mock-console-token', 'token-for-sasjsuser')

    const { calls } = await loadConsole()
    await selectRoute('GET /SASjsApi/user')
    await sendAndWait(calls)

    expect(calls[0].url).toMatch(/\/SASjsApi\/user$/)
    expect(calls[0].init.headers.authorization).toBe(
      'Bearer token-for-sasjsuser'
    )
  })

  it('filters the list, and says so when nothing matches', async () => {
    await loadConsole()
    const filter = document.getElementById('filter') as HTMLInputElement

    filter.value = 'group'
    filter.dispatchEvent(new Event('input'))
    expect(document.querySelectorAll('#routes .route')).toHaveLength(0)
    expect(document.getElementById('routes')!.textContent).toContain(
      'No route matches that.'
    )

    filter.value = 'user'
    filter.dispatchEvent(new Event('input'))
    expect(document.querySelectorAll('#routes .route')).toHaveLength(2)
  })

  it('marks a route the host does not implement, and one that takes an upload', async () => {
    const extra = [
      {
        id: 'POST /SASjsApi/drive/deploy/upload',
        method: 'POST',
        path: '/SASjsApi/drive/deploy/upload',
        tag: 'Drive',
        summary: 'Upload a deployment',
        params: [],
        requestBodies: ['multipart/form-data'],
        responses: [],
        implemented: true
      },
      {
        id: 'GET /SASjsApi/session/{sessionId}/log',
        method: 'GET',
        path: '/SASjsApi/session/{sessionId}/log',
        tag: 'Session',
        summary: 'A session log',
        params: [
          { name: 'sessionId', in: 'path', required: true, type: 'string' }
        ],
        requestBodies: [],
        responses: [],
        implemented: false,
        reason: 'this host keeps no log file'
      }
    ]
    jest.resetModules()
    document.body.innerHTML = bodyOf(page())
    ;(global as any).fetch = jest.fn(async (url: string) =>
      String(url).includes('operations.json')
        ? jsonResponse(extra)
        : jsonResponse(fixture)
    )
    require('../assets/api-console.js')
    for (let i = 0; i < 200; i++) {
      if (document.querySelectorAll('#routes .route').length) break
      await new Promise((resolve) => setTimeout(resolve, 5))
    }
    ;(global as any).fetch = jest.fn(async () => jsonResponse({}))

    await selectRoute('POST /SASjsApi/drive/deploy/upload')
    expect(document.getElementById('form')!.textContent).toContain(
      'does not send'
    )

    await selectRoute('GET /SASjsApi/session/{sessionId}/log')
    expect(document.getElementById('summary')!.textContent).toContain(
      'does not implement'
    )
    // a path parameter is rendered as a field, and the URL it builds carries it
    expect(
      document.querySelector('#form [data-name="sessionId"]')
    ).not.toBeNull()
  })

  it('reports a body that is not the JSON it claims to be, without sending it', async () => {
    const { calls } = await loadConsole()
    // a parameter the table describes as an object is sent as typed
    const operations = [...document.querySelectorAll('#routes .route')]
    expect(operations.length).toBeGreaterThan(0)

    await selectRoute('POST /SASjsApi/user')
    // the user route's fields are strings, so drive the object branch directly:
    // an array parameter is the same code path
    const field = document.querySelector(
      '#form [data-name="username"]'
    ) as HTMLInputElement
    field.dataset.type = 'object'
    field.value = '{not json'
    ;(document.getElementById('send') as HTMLButtonElement).click()

    await settle(() =>
      /must be JSON/.test(document.getElementById('body')!.textContent || '')
    )
    expect(calls).toHaveLength(0)
    expect(document.getElementById('body')!.textContent).toContain(
      'must be JSON'
    )
  })

  it('shows a non-JSON answer as it came, and an empty one as empty', async () => {
    const { calls } = await loadConsole()
    await selectRoute('GET /SASjsApi/user')

    ;(global as any).fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: { get: () => 'text/plain' },
      text: async () => 'NOTE: hello'
    }))
    await sendAndWait(calls)
    await settle(
      () => document.getElementById('body')!.textContent === 'NOTE: hello'
    )
    expect(document.getElementById('body')!.textContent).toBe('NOTE: hello')

    ;(global as any).fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: { get: () => 'application/json' },
      text: async () => ''
    }))
    ;(document.getElementById('send') as HTMLButtonElement).click()
    await settle(
      () => document.getElementById('body')!.textContent === '(empty body)'
    )
    expect(document.getElementById('body')!.textContent).toBe('(empty body)')
  })

  it('reports a request that never reached the host', async () => {
    await loadConsole()
    await selectRoute('GET /SASjsApi/user')

    ;(global as any).fetch = jest.fn(async () => {
      throw new Error('the network is gone')
    })
    ;(document.getElementById('send') as HTMLButtonElement).click()
    await settle(
      () => document.getElementById('status')!.textContent === 'request failed'
    )

    expect(document.getElementById('status')!.textContent).toBe(
      'request failed'
    )
    expect(document.getElementById('body')!.textContent).toContain(
      'the network is gone'
    )
  })

  it('copies the answer, and survives a clipboard that refuses', async () => {
    await loadConsole()
    await selectRoute('GET /SASjsApi/user')

    const written: string[] = []
    ;(navigator as any).clipboard = {
      writeText: async (text: string) => {
        written.push(text)
      }
    }
    document.getElementById('body')!.textContent = '{"a":1}'
    ;(document.getElementById('copy') as HTMLButtonElement).click()
    await settle(() => written.length === 1)
    expect(written).toEqual(['{"a":1}'])
    expect(document.getElementById('copy')!.textContent).toBe('Copied')

    ;(navigator as any).clipboard = {
      writeText: async () => {
        throw new Error('denied')
      }
    }
    ;(document.getElementById('copy') as HTMLButtonElement).click()
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(document.getElementById('copy')!.textContent).toBe('Copied')
  })

  it('selects the route named in the URL, so a reload comes back to it', async () => {
    jest.resetModules()
    document.body.innerHTML = bodyOf(page())
    history.replaceState(
      {},
      '',
      '/api/?route=' + encodeURIComponent('GET /SASjsApi/user')
    )
    ;(global as any).fetch = jest.fn(async (url: string) =>
      String(url).includes('operations.json')
        ? jsonResponse(operations)
        : jsonResponse(fixture)
    )

    require('../assets/api-console.js')
    for (let i = 0; i < 200; i++) {
      if (document.getElementById('title')!.textContent) break
      await new Promise((resolve) => setTimeout(resolve, 5))
    }

    expect(document.getElementById('title')!.textContent).toBe(
      'GET /SASjsApi/user'
    )
    history.replaceState({}, '', '/api/')
  })

  it('stores the token acting as another account returns, and sends it', async () => {
    // `as()` resolves and then reloads the page, so the store has to happen
    // between the two: a spec that only ever sets the token by hand would stay
    // green if the console stored it after the reload, when nothing was left to
    // store it for
    const { calls } = await loadConsole(() => {
      ;(window as any).SASjsMock = {
        identity: async () => ({ fixture, subject: null }),
        as: async () => ({
          accessToken: 'token-for-sasjsuser',
          refreshToken: 'refresh-for-sasjsuser'
        })
      }
    })

    const actAs = [...document.querySelectorAll('#accounts button')].find(
      (candidate) => (candidate as HTMLElement).dataset.user === 'sasjsuser'
    ) as HTMLButtonElement
    expect(actAs).toBeTruthy()
    actAs.click()

    await settle(
      () =>
        sessionStorage.getItem('mock-console-token') === 'token-for-sasjsuser'
    )
    expect(sessionStorage.getItem('mock-console-token')).toBe(
      'token-for-sasjsuser'
    )

    await selectRoute('GET /SASjsApi/user')
    await sendAndWait(calls)
    expect(calls[0].init.headers.authorization).toBe(
      'Bearer token-for-sasjsuser'
    )
  })

  it('registers the versioned worker, waits for control, and hands over the drive', async () => {
    const { requested } = stubScripts()
    const host = withServiceWorker()

    await loadConsole(() => {
      document.head.innerHTML =
        '<meta name="sasjs-mock-version" content="1.2.3" />'
      ;(window as any).__sasjsMockReady = Promise.resolve({ booted: true })
    })

    await settle(() => host.sw.register.mock.calls.length === 1)
    // the app's loader registers this exact URL: two URLs for one scope replace
    // each other, which is an install nobody asked for
    expect(host.sw.register.mock.calls[0][0]).toContain('sw.js?v=1.2.3')
    expect(host.sw.register.mock.calls[0][1]).toEqual(
      expect.objectContaining({ scope: '/', updateViaCache: 'none' })
    )

    // a registration completes before the navigation commits, so the page waits
    host.takeControl()
    await settle(() => requested.some((url) => url.includes('host/persist.js')))
    expect(requested.some((url) => url.includes('host/persist.js'))).toBe(true)
  })

  it('registers the plain worker URL while the page carries the placeholder', async () => {
    const host = withServiceWorker()
    // the placeholder is what a hand-copied asset carries: it is not a version
    await loadConsole(() => {
      document.head.innerHTML =
        '<meta name="sasjs-mock-version" content="__MOCK_VERSION__" />'
    })

    await settle(() => host.sw.register.mock.calls.length === 1)
    expect(host.sw.register.mock.calls[0][0]).not.toContain('?v=')

    // let the page past its wait: a registration nobody claims leaves a 4s timer
    // that fires during whatever test runs next, and its reload throws there
    host.takeControl()
    await new Promise((resolve) => setTimeout(resolve, 20))
  })

  it('says so when the browser refuses the registration', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {})
    const host = withServiceWorker({ registerFails: true })

    await loadConsole()
    await settle(() => error.mock.calls.length > 0)

    expect(error.mock.calls[0][0]).toContain('could not register')
    expect(host.sw.register).toHaveBeenCalled()
    error.mockRestore()
  })

  it('says so when the drive could not be handed over', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {})
    const { requested } = stubScripts()
    const host = withServiceWorker()

    await loadConsole(() => {
      ;(window as any).__sasjsMockReady = Promise.reject(
        new Error('no storage in this browser')
      )
    })

    host.takeControl()
    await settle(() =>
      error.mock.calls.some((call) => /handed over/.test(String(call[0])))
    )
    expect(
      error.mock.calls.some((call) => /handed over/.test(String(call[0])))
    ).toBe(true)
    expect(requested.some((url) => url.includes('host/persist.js'))).toBe(true)
    error.mockRestore()
  })

  it('prefills the sign-in route from the demo administrator', async () => {
    const signIn = [
      {
        id: 'POST /SASLogon/login',
        method: 'POST',
        path: '/SASLogon/login',
        tag: 'Auth',
        summary: 'Sign in',
        params: [
          { name: 'username', in: 'body', required: true, type: 'string' },
          { name: 'password', in: 'body', required: true, type: 'string' }
        ],
        requestBodies: ['application/json'],
        responses: [{ status: 200, description: 'Ok' }],
        implemented: true
      }
    ]
    await loadConsole(() => {}, signIn)
    await selectRoute('POST /SASLogon/login')

    // the credentials are published on purpose, and this is where a visitor needs
    // them: the route they sign in with
    const username = document.querySelector(
      '#form [data-name="username"]'
    ) as HTMLInputElement
    const password = document.querySelector(
      '#form [data-name="password"]'
    ) as HTMLInputElement
    expect(username.value).toBe('sasjsadmin')
    expect(password.value).toBe('Orion123')
  })

  it('puts a query parameter in the URL, and leaves it off when empty', async () => {
    const withQuery = [
      {
        id: 'GET /SASjsApi/user/list',
        method: 'GET',
        path: '/SASjsApi/user/list',
        tag: 'User',
        summary: 'List with a filter',
        params: [
          { name: 'search', in: 'query', required: false, type: 'string' }
        ],
        requestBodies: [],
        responses: [{ status: 200, description: 'Ok' }],
        implemented: true
      }
    ]
    const { calls } = await loadConsole(() => {}, withQuery)
    await selectRoute('GET /SASjsApi/user/list')

    await sendAndWait(calls)
    expect(calls[0].url).toMatch(/\/SASjsApi\/user\/list$/)

    // the button is disabled while a request is in flight, and a disabled button
    // ignores a click, so wait for the first answer to land
    await settle(
      () => !(document.getElementById('send') as HTMLButtonElement).disabled
    )
    fill('search', 'demo reviewer')
    await sendAndWait(calls, 2)
    expect(calls[1].url).toBe('/SASjsApi/user/list?search=demo+reviewer')
  })

  it('says so when the host refuses to act as an account', async () => {
    const alert = jest.spyOn(window, 'alert').mockImplementation(() => {})
    const error = jest.spyOn(console, 'error').mockImplementation(() => {})

    await loadConsole(() => {
      ;(window as any).SASjsMock = {
        identity: async () => ({ fixture, subject: null }),
        as: async () => {
          throw new Error('no such account')
        }
      }
    })

    const actAs = [...document.querySelectorAll('#accounts button')].find(
      (candidate) => (candidate as HTMLElement).dataset.user === 'sasjsuser'
    ) as HTMLButtonElement
    actAs.click()

    await settle(() => alert.mock.calls.length > 0)
    expect(String(alert.mock.calls[0][0])).toContain('no such account')
    expect(document.getElementById('who')!.textContent).not.toContain(
      'sasjsuser'
    )
    alert.mockRestore()
    error.mockRestore()
  })

  it('refuses a route whose required field is empty, instead of sending the placeholder', async () => {
    const { calls } = await loadConsole()
    await selectRoute('POST /SASjsApi/user')

    // username is required, and nothing is typed into it
    ;(document.getElementById('send') as HTMLButtonElement).click()

    await settle(
      () => document.getElementById('status')!.textContent === 'missing input'
    )
    expect(calls).toHaveLength(0)
    expect(document.getElementById('body')!.textContent).toContain('username')
  })

  it('refuses a number that is not a number, rather than sending null', async () => {
    const withNumber = [
      {
        id: 'POST /SASjsApi/code/trigger',
        method: 'POST',
        path: '/SASjsApi/code/trigger',
        tag: 'Code',
        summary: 'Trigger a scheduled run',
        params: [
          {
            name: 'expiresAfterMins',
            in: 'body',
            required: false,
            type: 'number'
          }
        ],
        requestBodies: ['application/json'],
        responses: [{ status: 200, description: 'Ok' }],
        implemented: true
      }
    ]
    const { calls } = await loadConsole(() => {}, withNumber)
    await selectRoute('POST /SASjsApi/code/trigger')
    fill('expiresAfterMins', 'ten')

    ;(document.getElementById('send') as HTMLButtonElement).click()
    await settle(() =>
      /must be a number/.test(
        document.getElementById('body')!.textContent || ''
      )
    )
    // JSON.stringify writes NaN as null, which the host would read as "absent"
    expect(calls).toHaveLength(0)
  })

  it('does not demand an upload it cannot take', async () => {
    // the form renders path, query and body only; a required `formData` field
    // would be an instruction the page cannot carry out
    const upload = [
      {
        id: 'POST /SASjsApi/drive/deploy/upload',
        method: 'POST',
        path: '/SASjsApi/drive/deploy/upload',
        tag: 'Drive',
        summary: 'Upload a deployment',
        params: [
          { name: 'file', in: 'formData', required: true, type: 'string' }
        ],
        requestBodies: ['multipart/form-data'],
        responses: [{ status: 200, description: 'Ok' }],
        implemented: true
      }
    ]
    const { calls } = await loadConsole(() => {}, upload)
    await selectRoute('POST /SASjsApi/drive/deploy/upload')

    ;(document.getElementById('send') as HTMLButtonElement).click()
    await settle(
      () =>
        calls.length > 0 ||
        /does not send/.test(document.getElementById('form')!.textContent || '')
    )

    expect(document.getElementById('status')!.textContent).not.toBe(
      'missing input'
    )
  })

  it('clears the drive and starts again when the URL asks it to', async () => {
    const reset = jest.fn(async () => {})
    sessionStorage.setItem('mock-console-token', 'stale')
    sessionStorage.setItem('mock-console-reloaded', '1')

    // jsdom does not navigate, and the redirect is the last thing the page does:
    // what matters here is that the drive was reset before it
    await loadConsole(() => {
      history.replaceState({}, '', '/api/?reset=1')
      ;(window as any).SASjsMock = { reset }
    })

    await settle(() => reset.mock.calls.length > 0)
    expect(reset).toHaveBeenCalled()
    expect(sessionStorage.length).toBe(0)
    history.replaceState({}, '', '/api/')
  })

  it('waits for the delete when there is no host to ask, and says so if it is blocked', async () => {
    // no SASjsMock on the page: the fallback deletes the database itself, and a
    // delete blocked by an open connection would otherwise complete after the
    // reload and land on the old drive
    const blocked: any = {}
    ;(global as any).indexedDB = {
      deleteDatabase: jest.fn(() => {
        setTimeout(() => blocked.onblocked && blocked.onblocked(), 5)
        return blocked
      })
    }

    await loadConsole(() => {
      // no host bridge on this page at all
      delete (window as any).SASjsMock
      history.replaceState({}, '', '/api/?reset=1')
    })

    await settle(() =>
      /could not be reset/.test(
        document.getElementById('routes')!.textContent || ''
      )
    )
    expect((global as any).indexedDB.deleteDatabase).toHaveBeenCalledWith(
      'sasjs-mock-host'
    )
    expect(document.getElementById('routes')!.textContent).toContain(
      'still holds the drive'
    )
    history.replaceState({}, '', '/api/')
    delete (global as any).indexedDB
  })

  it('leaves the drive alone for any other value of the reset flag', async () => {
    // `?reset=0` is the obvious way to say "not now", and a bare `?reset` is not
    // the flag the page documents either: only `=1` clears the drive
    const reset = jest.fn(async () => {})
    sessionStorage.setItem('mock-console-token', 'kept')

    await loadConsole(() => {
      history.replaceState({}, '', '/api/?reset=0')
      ;(window as any).SASjsMock = { reset }
    })

    await settle(() => document.querySelectorAll('#routes .route').length > 0)
    expect(reset).not.toHaveBeenCalled()
    expect(sessionStorage.getItem('mock-console-token')).toBe('kept')
    history.replaceState({}, '', '/api/')
  })

  it('omits an untouched optional boolean on a patch, and sends it when chosen', async () => {
    // PATCH /SASjsApi/user/{uid} applies every key it is given: an untouched
    // `isAdmin` sent as `false` would demote the account it was meant to leave be
    const patch = [
      {
        id: 'PATCH /SASjsApi/user/{uid}',
        method: 'PATCH',
        path: '/SASjsApi/user/{uid}',
        tag: 'User',
        summary: 'Update a user',
        params: [
          { name: 'uid', in: 'path', required: true, type: 'string' },
          {
            name: 'displayName',
            in: 'body',
            required: true,
            type: 'string'
          },
          { name: 'username', in: 'body', required: true, type: 'string' },
          { name: 'password', in: 'body', required: true, type: 'string' },
          { name: 'isAdmin', in: 'body', required: false, type: 'boolean' }
        ],
        requestBodies: ['application/json'],
        responses: [{ status: 200, description: 'Ok' }],
        implemented: true
      }
    ]
    const { calls } = await loadConsole(() => {}, patch)
    await selectRoute('PATCH /SASjsApi/user/{uid}')

    fill('uid', 'user-restricted')
    fill('displayName', 'Restricted user')
    fill('username', 'sasjsuser')
    fill('password', 'Orion123')
    await sendAndWait(calls)

    const untouched = JSON.parse(calls[0].init.body)
    expect(untouched.isAdmin).toBeUndefined()
    expect(calls[0].url).toMatch(/\/SASjsApi\/user\/user-restricted$/)

    // and choosing a value sends it, as a boolean rather than the string
    await settle(
      () => !(document.getElementById('send') as HTMLButtonElement).disabled
    )
    ;(
      document.querySelector(
        '#form select[data-name="isAdmin"]'
      ) as HTMLSelectElement
    ).value = 'true'
    await sendAndWait(calls, 2)

    expect(JSON.parse(calls[1].init.body).isAdmin).toBe(true)
  })

  it('sends a named shape as JSON, while an enum stays the word that was typed', async () => {
    // `fileTree` is `FileTree` and the package refuses it as a string; `runTime`
    // is `RunTimeType` and only accepts `js` or `sas`
    const deploy = [
      {
        id: 'POST /SASjsApi/drive/deploy',
        method: 'POST',
        path: '/SASjsApi/drive/deploy',
        tag: 'Drive',
        summary: 'Deploy a bundle',
        params: [
          { name: 'appLoc', in: 'body', required: true, type: 'string' },
          { name: 'fileTree', in: 'body', required: true, type: 'FileTree' },
          { name: 'runTime', in: 'body', required: false, type: 'RunTimeType' }
        ],
        requestBodies: ['application/json'],
        responses: [{ status: 200, description: 'Ok' }],
        implemented: true
      }
    ]
    const { calls } = await loadConsole(() => {}, deploy)
    await selectRoute('POST /SASjsApi/drive/deploy')

    fill('appLoc', '/Public/app/demo')
    fill(
      'fileTree',
      JSON.stringify({
        members: [{ name: 'services', type: 'folder', members: [] }]
      })
    )
    fill('runTime', 'sas')
    await sendAndWait(calls)

    const body = JSON.parse(calls[0].init.body)
    expect(typeof body.fileTree).toBe('object')
    expect(body.fileTree.members[0].name).toBe('services')
    // an enum is not JSON and must not be coerced
    expect(body.runTime).toBe('sas')
  })

  it('names the account it falls back to when the fixture ships no administrator', async () => {
    // a project's own fixture need not have an admin; calling its first user "the
    // demo administrator" would be a claim the host does not support
    const plain = {
      format: 1,
      users: [
        { uid: 'u1', username: 'plain1', password: 'Orion123', isAdmin: false },
        { uid: 'u2', username: 'plain2', password: 'Orion123', isAdmin: false }
      ]
    }
    await loadConsole(
      () => {
        ;(window as any).SASjsMock = {
          identity: async () => ({ fixture: plain, subject: 'plain1' }),
          as: async () => ({ accessToken: 't', refreshToken: 'r' })
        }
      },
      operations,
      plain
    )

    const note = document.getElementById('accounts')!.textContent || ''
    expect(note).toContain('no administrator')
    expect(note).toContain('plain1')

    // act as that account, which is what puts the way back on the page
    ;(
      [...document.querySelectorAll('#accounts button')].find(
        (button) => (button as HTMLElement).dataset.user === 'plain2'
      ) as HTMLButtonElement
    ).click()
    const back = await (async () => {
      for (let i = 0; i < 200; i++) {
        const found = [...document.querySelectorAll('#accounts button')].find(
          (button) => /^Back to/.test(button.textContent || '')
        )
        if (found) return found
        await new Promise((resolve) => setTimeout(resolve, 5))
      }
      return undefined
    })()

    expect(back).toBeDefined()
    expect(back!.textContent).toBe('Back to plain1')
  })

  it('drops the token when the visitor goes back to the demo administrator', async () => {
    sessionStorage.setItem('mock-console-token', 'token-for-sasjsuser')
    ;(global as any).SASjsMock = {
      as: async () => ({ accessToken: 'admin-token' }),
      identity: async () => ({ subject: 'sasjsuser' })
    }

    const { calls } = await loadConsole()

    // the page offers the way back only while it is acting as someone
    const back = [...document.querySelectorAll('#accounts button')].find(
      (button) => (button.textContent || '').includes('Back to the demo')
    ) as HTMLButtonElement | undefined
    expect(back).toBeDefined()
    back!.click()
    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(sessionStorage.getItem('mock-console-token')).toBeNull()

    await selectRoute('GET /SASjsApi/user')
    await sendAndWait(calls)
    expect(calls[0].init.headers.authorization).toBeUndefined()
  })
})
