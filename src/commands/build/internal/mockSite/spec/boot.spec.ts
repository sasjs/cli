export {}

/**
 * The boot loader the site ships: it is a file rather than an inline script
 * (an app with a strict Content-Security-Policy refuses an inline one), so the
 * page has to hand it the app's script tags through a data attribute. What
 * matters here is that it registers the worker, waits for the host, and then
 * replays every tag the page had - in order - because a page that loads several
 * plain scripts must boot the same way a bundled app does. The fallbacks matter
 * too: a site whose worker never claims the page fails every request, so each
 * dead end either reloads once or says so in the console.
 */

type FakeScript = {
  src?: string
  id?: string
  type?: string
  crossOrigin?: string
  integrity?: string
  noModule?: boolean
  textContent?: string
  onload?: () => void
  onerror?: () => void
  attributes: { [name: string]: string }
  setAttribute: (name: string, value: string) => void
}

type Options = {
  /** 'present' controls the page at once, 'late' fires controllerchange, 'never' does neither */
  controller?: 'present' | 'late' | 'never'
  /** the reload guard's stored value: null means the page has not reloaded yet */
  guard?: string | null
  registerFails?: boolean
  /** window.__sasjsMockReady resolving with an error */
  bootError?: string
  /** a data-scripts value that is not JSON */
  brokenConfig?: boolean
  /** the document exposes no currentScript */
  noScript?: boolean
  /** the boot tag carries no version query */
  noStamp?: boolean
  /** srcs whose script fails to load */
  failSrcs?: string[]
}

const loadBoot = (specs: any[], options: Options = {}) => {
  jest.resetModules()
  const appended: FakeScript[] = []
  const timeline: string[] = []
  const registered: string[] = []
  const stored: { [key: string]: string } = {}
  if (options.guard) stored['mock-sw-reloaded'] = options.guard

  const createElement = () => {
    const element: FakeScript = {
      attributes: {},
      setAttribute(name: string, value: string) {
        element.attributes[name] = value
        if (name === 'type') element.type = value
      }
    }
    return element
  }

  const document: any = {
    currentScript: options.noScript
      ? null
      : {
          // the builder stamps the boot tag with the host version, and the
          // loader reuses that query for the worker's own URL
          src: options.noStamp
            ? 'http://localhost:8123/host/boot.js'
            : 'http://localhost:8123/host/boot.js?v=abc123',
          getAttribute: (name: string) => {
            if (name !== 'data-scripts') return null
            return options.brokenConfig ? 'not json' : JSON.stringify(specs)
          }
        },
    createElement,
    body: {
      appendChild: (element: FakeScript) => {
        appended.push(element)
        timeline.push(element.src || '[' + element.textContent + ']')
        if (!element.src) return element
        setTimeout(() => {
          const failed = (options.failSrcs || []).includes(element.src!)
          if (failed && element.onerror) element.onerror()
          else if (element.onload) element.onload()
        }, 0)
        return element
      }
    }
  }

  const listeners: { [type: string]: (() => void)[] } = {}
  const controller = options.controller || 'present'
  const navigator: any = {
    serviceWorker: {
      register: (url: string, init: any) => {
        registered.push(url + ' ' + JSON.stringify(init))
        return options.registerFails
          ? Promise.reject(new Error('nope'))
          : Promise.resolve()
      },
      ready: Promise.resolve(),
      get controller() {
        if (controller === 'present') return {}
        if (controller === 'late' && late) return {}
        return null
      },
      addEventListener: (type: string, fn: () => void) => {
        listeners[type] = listeners[type] || []
        listeners[type].push(fn)
      }
    }
  }
  let late = false

  ;(global as any).document = document
  ;(global as any).navigator = navigator
  ;(global as any).window = options.bootError
    ? { __sasjsMockReady: Promise.resolve({ error: options.bootError }) }
    : {}
  ;(global as any).sessionStorage = {
    getItem: (key: string) => (key in stored ? stored[key] : null),
    setItem: (key: string, value: string) => {
      stored[key] = value
    }
  }
  ;(global as any).location = { reload: () => timeline.push('reload') }
  jest.spyOn(console, 'error').mockImplementation(() => {})

  require('../assets/boot.js')

  const claim = () => {
    late = true
    ;(listeners['controllerchange'] || []).forEach((fn) => fn())
  }

  return { appended, timeline, registered, stored, claim }
}

const settle = async () => {
  for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 1))
}

describe('the boot loader', () => {
  afterEach(() => {
    delete (global as any).document
    delete (global as any).navigator
    delete (global as any).window
    delete (global as any).sessionStorage
    delete (global as any).location
  })

  it("registers the worker at the site root, at the build's version", async () => {
    const { registered } = loadBoot([])
    await settle()

    // a cached sw.js would keep a returning visitor on the previous build's
    // worker, so the URL carries the host version and the check skips the cache
    expect(registered).toEqual([
      '/sw.js?v=abc123 ' +
        JSON.stringify({ scope: '/', updateViaCache: 'none' })
    ])
  })

  it('boots the host before the app, then replays every tag in order', async () => {
    const { timeline } = loadBoot([
      { src: 'sasjs.js', id: 'sasjs-adapter' },
      { code: 'window.__config = 1' },
      { src: 'js/backend.js' },
      { src: 'js/game.js' }
    ])
    await settle()

    expect(timeline).toEqual([
      'host/persist.js',
      'host/intercept.js',
      'sasjs.js',
      '[window.__config = 1]',
      'js/backend.js',
      'js/game.js'
    ])
  })

  it('keeps the attributes an app relies on', async () => {
    const { appended } = loadBoot([
      { src: 'sasjs.js', id: 'sasjs-adapter' },
      { src: 'main.js', type: 'module' },
      { src: 'cdn.js', crossOrigin: 'anonymous', integrity: 'sha384-x' },
      { src: 'legacy.js', noModule: 'true' }
    ])
    await settle()

    // the first two are the host's own: persist.js and intercept.js
    const app = appended.slice(2)
    expect(app.map((element) => element.src)).toEqual([
      'sasjs.js',
      'main.js',
      'cdn.js',
      'legacy.js'
    ])
    expect(app[0].id).toEqual('sasjs-adapter')
    expect(app[1].type).toEqual('module')
    expect(app[2].crossOrigin).toEqual('anonymous')
    expect(app[2].integrity).toEqual('sha384-x')
    expect(app[3].noModule).toBe(true)
  })

  it('runs an inline snippet without waiting for a load event', async () => {
    const { appended } = loadBoot([{ code: 'window.__boot = 1' }])
    await settle()

    const inline = appended.find((element) => element.textContent)
    expect(inline).toBeDefined()
    expect(inline!.src).toBeUndefined()
  })

  it('moves on when a script fails to load', async () => {
    const { timeline } = loadBoot(
      [{ src: 'missing.js' }, { src: 'js/game.js' }],
      { failSrcs: ['missing.js'] }
    )
    await settle()

    expect(timeline.slice(-2)).toEqual(['missing.js', 'js/game.js'])
  })

  it('moves on when a host script fails to load', async () => {
    const { timeline } = loadBoot([{ src: 'js/game.js' }], {
      failSrcs: ['host/persist.js']
    })
    await settle()

    // a dead persist.js still reaches the app rather than hanging the page
    expect(timeline).toContain('js/game.js')
  })

  it('reports an error the host booted with', async () => {
    loadBoot([], { bootError: 'seed missing' })
    await settle()
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('seed missing')
    )
  })

  it('refuses a boot config it cannot read instead of guessing', async () => {
    const { timeline } = loadBoot([], { brokenConfig: true })
    await settle()

    expect(timeline).toEqual([])
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('boot config could not be read')
    )
  })

  it('registers the plain worker URL when the tag carries no version', async () => {
    const { registered } = loadBoot([], { noStamp: true })
    await settle()

    expect(registered[0]).toMatch(/^\/sw\.js /)
  })

  it('boots the host with no app scripts when the tag carries no config', async () => {
    const { timeline } = loadBoot([], { noScript: true })
    await settle()

    expect(timeline).toEqual(['host/persist.js', 'host/intercept.js'])
  })

  it('waits for a worker that takes control a moment later', async () => {
    const { timeline, claim } = loadBoot([{ src: 'app.js' }], {
      controller: 'late'
    })
    await settle()
    claim()
    await settle()

    expect(timeline).toEqual(['host/persist.js', 'host/intercept.js', 'app.js'])
  })

  it('boots anyway when the worker cannot be registered at all', async () => {
    const { timeline } = loadBoot([{ src: 'app.js' }], {
      registerFails: true,
      controller: 'never'
    })
    await settle()

    expect(timeline).toEqual(['host/persist.js', 'host/intercept.js', 'app.js'])
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('service worker registration failed')
    )
  })

  it('reloads once when the worker never claims the page', async () => {
    const { timeline, stored } = loadBoot([{ src: 'app.js' }], {
      controller: 'never'
    })
    // the loader's grace period is 4s: wait past it so its timer cannot fire
    // into the next test's globals
    await new Promise((r) => setTimeout(r, 4200))

    expect(stored['mock-sw-reloaded']).toEqual('1')
    expect(timeline).toEqual(['reload'])
  }, 10000)

  it('boots anyway once the reload has already been tried', async () => {
    const { timeline } = loadBoot([{ src: 'app.js' }], {
      controller: 'never',
      guard: '1'
    })
    await new Promise((r) => setTimeout(r, 4200))

    expect(timeline).toEqual(['host/persist.js', 'host/intercept.js', 'app.js'])
  }, 10000)

  it('starts without a worker when service workers are unavailable', async () => {
    jest.resetModules()
    const timeline: string[] = []
    const document: any = {
      currentScript: {
        getAttribute: () => JSON.stringify([{ src: 'app.js' }])
      },
      createElement: () => ({}),
      body: {
        appendChild: (element: FakeScript) => {
          timeline.push(element.src!)
          setTimeout(() => element.onload && element.onload(), 0)
          return element
        }
      }
    }
    ;(global as any).document = document
    ;(global as any).navigator = {}
    ;(global as any).window = {}
    ;(global as any).sessionStorage = { getItem: () => null, setItem: () => {} }
    ;(global as any).location = { reload: () => {} }
    jest.spyOn(console, 'error').mockImplementation(() => {})

    require('../assets/boot.js')
    await settle()

    expect(timeline).toEqual(['host/persist.js', 'host/intercept.js', 'app.js'])
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('service workers are unavailable')
    )
  })
})
