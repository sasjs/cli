/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "http://localhost/demo/api-console/"}
 */
import fs from 'fs'
import path from 'path'

export {}

/**
 * The console under a base path.
 *
 * `mockWebBasePath` is a supported option (a site published at `/demo`), and the
 * console works out its root from the worker it registered - `<base>/sw.js` - with
 * its own URL as the fallback. This file runs the page at `/demo/api-console/`,
 * where a wrong derivation is silent: the page still renders, and every call goes
 * to a path the host does not answer.
 */
const assets = path.join(__dirname, '..', 'assets')
const page = () => fs.readFileSync(path.join(assets, 'api-index.html'), 'utf8')

const bodyOf = (html: string) =>
  html.slice(html.indexOf('<body>') + 6, html.lastIndexOf('</body>'))

const jsonResponse = (body: any) => ({
  ok: true,
  status: 200,
  statusText: 'OK',
  headers: { get: () => 'application/json' },
  json: async () => body,
  text: async () => JSON.stringify(body)
})

const operations = [
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

const settle = async (check: () => boolean) => {
  for (let i = 0; i < 400; i++) {
    if (check()) return
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  throw new Error('the page did not reach the state the case expected')
}

describe('the API console under a base path', () => {
  afterEach(() => {
    delete (navigator as any).serviceWorker
  })

  it('takes the root from the worker that covers it, not from its own folder', async () => {
    // the shapes where the two disagree are the only ones that prove the worker
    // is read at all: the site's worker at `/demo/sw.js` controlling a console
    // two folders down still names `/demo/`, which the folder alone cannot
    document.body.innerHTML = bodyOf(page())
    document.head.innerHTML =
      '<meta name="sasjs-mock-version" content="3.0.0" />'

    ;(global as any).fetch = jest.fn(async (url: string) =>
      String(url).includes('operations.json')
        ? jsonResponse(operations)
        : jsonResponse({ format: 1, users: [] })
    )

    const realCreate = document.createElement.bind(document)
    jest.spyOn(document, 'createElement').mockImplementation((tag: any) => {
      const node = realCreate(tag)
      if (String(tag).toLowerCase() === 'script')
        setTimeout(() => node.dispatchEvent(new Event('load')), 0)
      return node
    })

    const sw: any = {
      controller: { scriptURL: 'http://localhost/demo/sw.js' },
      register: jest.fn(async () => ({})),
      addEventListener: jest.fn()
    }
    Object.defineProperty(navigator, 'serviceWorker', {
      value: sw,
      configurable: true
    })

    history.replaceState({}, '', '/demo/tools/api-console/')
    jest.resetModules()
    require('../assets/api-console.js')

    await settle(() =>
      (global as any).fetch.mock.calls.some((call: any[]) =>
        String(call[0]).includes('identity.json')
      )
    )

    const asked = (global as any).fetch.mock.calls.map((call: any[]) =>
      String(call[0])
    )
    // the site's root, not the folder two levels up from the page
    expect(asked).toContain('/demo/host/identity.json')
    expect(asked.some((url: string) => url.startsWith('/demo/tools/'))).toBe(
      false
    )
    history.replaceState({}, '', '/demo/tools/api-console/')
  })

  it('ignores a worker that belongs to another site', async () => {
    // a page can be controlled by some other site's worker; its `sw.js` names a
    // root that has nothing to do with this console, so the page's own folder has
    // to win
    document.body.innerHTML = bodyOf(page())
    document.head.innerHTML =
      '<meta name="sasjs-mock-version" content="3.0.0" />'

    ;(global as any).fetch = jest.fn(async (url: string) =>
      String(url).includes('operations.json')
        ? jsonResponse(operations)
        : jsonResponse({ format: 1, users: [] })
    )

    const realCreate = document.createElement.bind(document)
    jest.spyOn(document, 'createElement').mockImplementation((tag: any) => {
      const node = realCreate(tag)
      if (String(tag).toLowerCase() === 'script')
        setTimeout(() => node.dispatchEvent(new Event('load')), 0)
      return node
    })

    const sw: any = {
      controller: { scriptURL: 'http://localhost/other/sw.js' },
      register: jest.fn(async () => ({})),
      addEventListener: jest.fn()
    }
    Object.defineProperty(navigator, 'serviceWorker', {
      value: sw,
      configurable: true
    })

    history.replaceState({}, '', '/demo/api-console/')
    jest.resetModules()
    require('../assets/api-console.js')

    await settle(() =>
      (global as any).fetch.mock.calls.some((call: any[]) =>
        String(call[0]).includes('identity.json')
      )
    )

    const asked = (global as any).fetch.mock.calls.map((call: any[]) =>
      String(call[0])
    )
    expect(asked).toContain('/demo/host/identity.json')
    expect(asked.some((url: string) => url.startsWith('/other/'))).toBe(false)
    history.replaceState({}, '', '/demo/api-console/')
  })

  it('finds the folder from a URL without its trailing slash', async () => {
    // `/demo/api` is the shape a person types, and the page used to read that as
    // the origin root: every call went to /SASjsApi/... and the worker to /sw.js
    history.replaceState({}, '', '/demo/api-console')
    expect(location.pathname).toBe('/demo/api-console')

    document.body.innerHTML = bodyOf(page())
    document.head.innerHTML =
      '<meta name="sasjs-mock-version" content="2.0.0" />'

    ;(global as any).fetch = jest.fn(async (url: string) =>
      String(url).includes('operations.json')
        ? jsonResponse(operations)
        : jsonResponse({ format: 1, users: [] })
    )

    const realCreate = document.createElement.bind(document)
    jest.spyOn(document, 'createElement').mockImplementation((tag: any) => {
      const node = realCreate(tag)
      if (String(tag).toLowerCase() === 'script')
        setTimeout(() => node.dispatchEvent(new Event('load')), 0)
      return node
    })

    const sw: any = {
      controller: {},
      register: jest.fn(async () => ({})),
      addEventListener: jest.fn()
    }
    Object.defineProperty(navigator, 'serviceWorker', {
      value: sw,
      configurable: true
    })

    jest.resetModules()
    require('../assets/api-console.js')
    await settle(() => sw.register.mock.calls.length === 1)

    expect(sw.register.mock.calls[0][0]).toContain('/demo/sw.js?v=2.0.0')
    expect(sw.register.mock.calls[0][1]).toEqual(
      expect.objectContaining({ scope: '/demo/' })
    )
    await settle(() => document.querySelectorAll('#routes .route').length > 0)
    const asked = (global as any).fetch.mock.calls.map((call: any[]) =>
      String(call[0])
    )
    expect(asked).toContain('/demo/host/identity.json')

    history.replaceState({}, '', '/demo/api-console/')
  })

  it('registers the worker and calls the API under the folder the site lives in', async () => {
    document.body.innerHTML = bodyOf(page())
    document.head.innerHTML =
      '<meta name="sasjs-mock-version" content="2.0.0" />'

    const calls: { url: string; init: any }[] = []
    ;(global as any).fetch = jest.fn(async (url: string, init: any = {}) => {
      if (String(url).includes('operations.json'))
        return jsonResponse(operations)
      if (String(url).includes('identity.json'))
        return jsonResponse({ format: 1, users: [] })
      calls.push({ url: String(url), init })
      return jsonResponse([])
    })

    // the host script is answered by hand: jsdom does not fetch a script it is
    // given, and the page waits for its load event before it reads the API
    const realCreate = document.createElement.bind(document)
    jest.spyOn(document, 'createElement').mockImplementation((tag: any) => {
      const node = realCreate(tag)
      if (String(tag).toLowerCase() === 'script')
        setTimeout(() => node.dispatchEvent(new Event('load')), 0)
      return node
    })

    const sw: any = {
      controller: {},
      register: jest.fn(async () => ({})),
      addEventListener: jest.fn()
    }
    Object.defineProperty(navigator, 'serviceWorker', {
      value: sw,
      configurable: true
    })

    const errors: any[] = []
    const errorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation((...args) => errors.push(args))
    const warnSpy = jest
      .spyOn(console, 'warn')
      .mockImplementation((...args) => errors.push(args))

    jest.resetModules()
    require('../assets/api-console.js')
    await settle(() => sw.register.mock.calls.length === 1).catch((e) => {
      throw new Error(
        e.message +
          ' | errors: ' +
          JSON.stringify(errors) +
          ' | routes: ' +
          (document.getElementById('routes') || ({} as any)).textContent
      )
    })
    errorSpy.mockRestore()
    warnSpy.mockRestore()

    expect(sw.register.mock.calls[0][0]).toContain('/demo/sw.js?v=2.0.0')
    expect(sw.register.mock.calls[0][1]).toEqual(
      expect.objectContaining({ scope: '/demo/' })
    )

    // the page's data comes from the same folder, not from the origin root
    await settle(
      () => document.querySelectorAll('#routes .route').length > 0
    ).catch((e) => {
      throw new Error(
        e.message +
          ' | routes: ' +
          JSON.stringify(
            (document.getElementById('routes') || ({} as any)).textContent
          ) +
          ' | fetched: ' +
          JSON.stringify(
            (global as any).fetch.mock.calls.map((c: any[]) => String(c[0]))
          ) +
          ' | errors: ' +
          JSON.stringify(errors)
      )
    })
    const asked = (global as any).fetch.mock.calls.map((call: any[]) =>
      String(call[0])
    )
    // the page's own table is fetched relative to the page, so it follows the
    // folder without any substitution; the host files are addressed absolutely
    expect(asked).toContain('operations.json')
    expect(asked).toContain('/demo/host/identity.json')

    // and a call goes to the API of that folder
    ;(
      [...document.querySelectorAll('#routes .route')][0] as HTMLButtonElement
    ).click()
    ;(document.getElementById('send') as HTMLButtonElement).click()
    await settle(() => calls.length > 0)
    expect(calls[0].url).toBe('/demo/SASjsApi/user')
  })
})
