import { JSDOM, VirtualConsole, requestInterceptor } from 'jsdom'
import { readFileSync } from 'fs'
import { join } from 'path'

const source = readFileSync(join(__dirname, '../assets/boot.js'), 'utf8')

type Options = {
  href?: string
  basePath?: string
  noScript?: boolean
  noStamp?: boolean
  invalidLoader?: boolean
  noWorker?: boolean
  register?: Promise<any>
  ready?: Promise<any>
  registerThrows?: boolean
  controller?: boolean
  oldController?: boolean
  fail?: string
  pending?: string
  persist?: Promise<any> | null
  missingBridge?: boolean
  pageLoading?: boolean
}

const loadBoot = (options: Options = {}) => {
  jest.resetModules()
  const appended: string[] = []
  const assetUrls: string[] = []
  const registered: any[] = []
  const listeners: { [type: string]: Function[] } = {}
  let controlled = options.controller !== false
  const pageHref = options.href || 'http://localhost:8123/'
  const stamp = options.noStamp ? '' : '?v=abc123'
  const loader = options.basePath
    ? `${new URL(pageHref).origin}${options.basePath}/host/boot.js${stamp}`
    : new URL('host/boot.js' + stamp, pageHref).href
  const page: any = {
    addEventListener: (type: string, fn: Function) => {
      ;(listeners[type] ||= []).push(fn)
    },
    removeEventListener: (type: string, fn: Function) => {
      listeners[type] = (listeners[type] || []).filter((item) => item !== fn)
    }
  }
  const add = (element: any) => {
    const src = 'host/' + new URL(element.src).pathname.split('/').pop()
    appended.push(src)
    assetUrls.push(element.src)
    if (options.pending === src) return element
    setTimeout(() => {
      if (options.fail === src) return element.onerror()
      if (element.src.includes('persist.js') && options.persist !== null)
        page.__sasjsMockPersistReady =
          options.persist ||
          Promise.resolve({ type: 'sasjs-seed-ack', booted: true })
      if (src === 'host/intercept.js' && !options.missingBridge)
        page.__sasjsMockBridgeInstalled = true
      element.onload()
    }, 0)
    return element
  }
  let currentController: any = null
  let registeredUrl = ''
  const worker = {
    register: (url: string, init: any) => {
      registeredUrl = url
      currentController = {
        scriptURL: options.oldController ? url + '-old' : url
      }
      registered.push([url, init])
      if (options.registerThrows)
        throw new Error('synchronous registration failure')
      return options.register || Promise.resolve({})
    },
    ready: options.ready || Promise.resolve({}),
    get controller() {
      return controlled ? currentController : null
    },
    addEventListener: (type: string, fn: Function) => {
      ;(listeners[type] ||= []).push(fn)
    },
    removeEventListener: (type: string, fn: Function) => {
      listeners[type] = (listeners[type] || []).filter((item) => item !== fn)
    }
  }
  ;(global as any).window = page
  ;(global as any).document = {
    readyState: options.pageLoading ? 'loading' : 'complete',
    currentScript: options.noScript
      ? null
      : { src: options.invalidLoader ? 'bad-url' : loader },
    createElement: () => ({}),
    head: { appendChild: add },
    body: null
  }
  ;(global as any).navigator = options.noWorker ? {} : { serviceWorker: worker }
  ;(global as any).location = {
    href: pageHref,
    pathname: new URL(pageHref).pathname,
    origin: new URL(pageHref).origin,
    reload: jest.fn()
  }
  require('../assets/boot.js')
  return {
    page,
    appended,
    assetUrls,
    registered,
    listeners,
    replaceController: () => {
      currentController = { scriptURL: registeredUrl }
      ;(listeners.controllerchange || []).slice().forEach((fn) => fn())
    },
    claim: () => {
      currentController = { scriptURL: registeredUrl }
      controlled = true
      ;(listeners.controllerchange || []).slice().forEach((fn) => fn())
    }
  }
}

const rejected = (error: Error) => {
  const promise = Promise.reject(error)
  promise.catch(() => {})
  return promise
}

const flush = async () => {
  await jest.advanceTimersByTimeAsync(1)
}

describe('mock boot', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    jest.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
    delete (global as any).document
    delete (global as any).navigator
    delete (global as any).window
    delete (global as any).location
  })

  it('publishes a stable readiness promise synchronously and registers immediately', async () => {
    let release!: (value: any) => void
    const persist = new Promise((resolve) => {
      release = resolve
    })
    const { page, appended, registered } = loadBoot({ persist })
    const ready = page.__sasjsMockReady
    expect(ready).toBeInstanceOf(Promise)
    expect(appended).toEqual([])
    expect(registered).toHaveLength(1)
    await flush()
    expect(appended).toEqual(['host/intercept.js', 'host/persist.js'])
    expect(page.__sasjsMockReady).toBe(ready)
    let settled = false
    ready.then(() => {
      settled = true
    })
    await Promise.resolve()
    expect(settled).toBe(false)
    release({ type: 'sasjs-seed-ack', booted: true })
    await expect(ready).resolves.toEqual({
      type: 'sasjs-seed-ack',
      booted: true
    })
  })

  it.each([
    [{}, 'http://localhost:8123/host/', '?v=abc123'],
    [
      { href: 'http://localhost:8123/demo', basePath: '/demo' },
      'http://localhost:8123/demo/host/',
      '?v=abc123'
    ],
    [{ noStamp: true }, 'http://localhost:8123/host/', ''],
    [
      { href: 'http://localhost:8123/demo', noScript: true },
      'http://localhost:8123/demo/host/',
      ''
    ],
    [
      { href: 'http://localhost:8123/demo/', noScript: true },
      'http://localhost:8123/demo/host/',
      ''
    ]
  ])(
    'loads host scripts with the loader version and base %#',
    async (options, base, stamp) => {
      const { page, assetUrls } = loadBoot(options as Options)
      await flush()
      await page.__sasjsMockReady
      expect(assetUrls.sort()).toEqual([
        base + 'intercept.js' + stamp,
        base + 'persist.js' + stamp
      ])
    }
  )

  it.each([
    [{}, 'http://localhost:8123/sw.js?v=abc123', '/'],
    [
      { href: 'http://localhost:8123/demo/', basePath: '/demo' },
      'http://localhost:8123/demo/sw.js?v=abc123',
      '/demo/'
    ],
    [
      { href: 'http://localhost:8123/demo', basePath: '/demo' },
      'http://localhost:8123/demo/sw.js?v=abc123',
      '/demo/'
    ],
    [
      { href: 'http://localhost:8123/demo', noScript: true },
      'http://localhost:8123/demo/sw.js',
      '/demo/'
    ],
    [
      { href: 'http://localhost:8123/demo/index.html', noScript: true },
      'http://localhost:8123/demo/sw.js',
      '/demo/'
    ],
    [{ noStamp: true }, 'http://localhost:8123/sw.js', '/']
  ])(
    'registers the versioned worker using its loader base %#',
    async (options, url, scope) => {
      const { page, registered } = loadBoot(options as Options)
      await flush()
      await page.__sasjsMockReady
      expect(registered).toEqual([[url, { scope, updateViaCache: 'none' }]])
    }
  )

  it('does not start persistence against an old controller', async () => {
    const { page, claim, appended } = loadBoot({ oldController: true })
    const settled = jest.fn()
    page.__sasjsMockReady.then(settled, settled)
    await flush()
    expect(appended).not.toContain('host/persist.js')
    expect(settled).not.toHaveBeenCalled()
    claim()
    await flush()
    await expect(page.__sasjsMockReady).resolves.toEqual({
      type: 'sasjs-seed-ack',
      booted: true
    })
  })

  it('rejects if the controller is replaced while persistence boots', async () => {
    let release!: (value: any) => void
    const persist = new Promise((resolve) => {
      release = resolve
    })
    const { page, replaceController } = loadBoot({ persist })
    await flush()
    replaceController()
    release({ type: 'sasjs-seed-ack' })
    await expect(page.__sasjsMockReady).rejects.toThrow(/controller changed/)
  })

  it('waits for a late controller without reloading', async () => {
    const { page, claim } = loadBoot({ controller: false })
    await flush()
    claim()
    await flush()
    await expect(page.__sasjsMockReady).resolves.toEqual({
      type: 'sasjs-seed-ack',
      booted: true
    })
    expect((global as any).location.reload).not.toHaveBeenCalled()
  })

  it('accepts the worker acknowledgement for a restored drive', async () => {
    const result = { type: 'sasjs-load-ack', booted: true }
    const { page } = loadBoot({ persist: Promise.resolve(result) })
    await flush()
    await expect(page.__sasjsMockReady).resolves.toEqual(result)
  })

  it.each([
    [{ noWorker: true }, /service workers.*unavailable/i],
    [{ invalidLoader: true }, /invalid url/i],
    [
      { register: rejected(new Error('registration denied')) },
      /registration denied/
    ],
    [{ fail: 'host/persist.js' }, /persist\.js/],
    [{ fail: 'host/intercept.js' }, /intercept\.js/],
    [{ missingBridge: true }, /intercept.*install/i],
    [{ persist: null }, /persist.*readiness/i],
    [{ persist: Promise.resolve(null) }, /no boot result/i],
    [{ persist: Promise.resolve({ error: 'seed missing' }) }, /seed missing/],
    [
      { persist: Promise.resolve({ driveError: 'incomplete drive' }) },
      /incomplete drive/
    ],
    [
      {
        persist: Promise.resolve({
          type: 'sasjs-seed-ack',
          boot: { driveError: 'shard unavailable' }
        })
      },
      /shard unavailable/
    ],
    [{ persist: Promise.resolve({}) }, /invalid.*acknowledg/i],
    [{ persist: rejected(new Error('storage failed')) }, /storage failed/]
  ])(
    'rejects rather than falsely reporting readiness %#',
    async (options, message) => {
      const { page } = loadBoot(options as Options)
      const check = expect(page.__sasjsMockReady).rejects.toThrow(
        message as RegExp
      )
      await flush()
      await check
    }
  )

  it.each([
    [{ register: new Promise(() => {}) }, /registration.*timed out/i],
    [{ ready: new Promise(() => {}) }, /service worker.*timed out/i],
    [{ controller: false }, /controller.*timed out/i],
    [{ oldController: true }, /controller.*timed out/i],
    [{ pending: 'host/persist.js' }, /persist\.js.*timed out/i],
    [{ pending: 'host/intercept.js' }, /intercept\.js.*timed out/i],
    [{ persist: new Promise(() => {}) }, /persist.*timed out/i]
  ])(
    'bounds an operation that never completes %#',
    async (options, message) => {
      const { page } = loadBoot(options as Options)
      const check = expect(page.__sasjsMockReady).rejects.toThrow(
        message as RegExp
      )
      await jest.advanceTimersByTimeAsync(60000)
      await check
      expect((global as any).location.reload).not.toHaveBeenCalled()
    }
  )

  it('rejects after 20 seconds when the native page load stalls', async () => {
    const { page, appended, listeners } = loadBoot({ pageLoading: true })
    const outcome = jest.fn()
    page.__sasjsMockReady.then(() => outcome('resolved'), outcome)
    await jest.advanceTimersByTimeAsync(19999)
    expect(outcome).not.toHaveBeenCalled()
    expect(appended).toEqual([])
    await jest.advanceTimersByTimeAsync(1)
    expect(outcome).toHaveBeenCalledTimes(1)
    expect(outcome.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        message: expect.stringMatching(/page.*load.*timed out/i)
      })
    )
    expect(appended).toEqual([])
    expect(listeners.load || []).toHaveLength(0)
  })

  it('starts host scripts only after the page load and clears the timeout', async () => {
    const { page, appended, listeners } = loadBoot({ pageLoading: true })
    await jest.advanceTimersByTimeAsync(10000)
    expect(appended).toEqual([])
    const onLoad = listeners.load[0]
    listeners.load = [] // The browser removes a once listener on dispatch.
    onLoad()
    await flush()
    await expect(page.__sasjsMockReady).resolves.toEqual({
      type: 'sasjs-seed-ack',
      booted: true
    })
    await jest.advanceTimersByTimeAsync(20000)
    expect(appended).toEqual(['host/intercept.js', 'host/persist.js'])
    expect(console.error).not.toHaveBeenCalled()
  })

  it('handles a page-load timeout after a synchronous setup failure', async () => {
    const unhandled = jest.fn()
    process.on('unhandledRejection', unhandled)
    try {
      const { page, listeners } = loadBoot({
        pageLoading: true,
        invalidLoader: true
      })
      await expect(page.__sasjsMockReady).rejects.toThrow(/invalid url/i)
      await jest.advanceTimersByTimeAsync(20001)
      expect(listeners.load || []).toHaveLength(0)
      expect(console.error).toHaveBeenCalledTimes(1)
      expect(console.error).toHaveBeenCalledWith(
        expect.stringMatching(/invalid url/i)
      )
      expect(unhandled).not.toHaveBeenCalled()
    } finally {
      process.removeListener('unhandledRejection', unhandled)
    }
  })

  it('handles an ignored rejection without emitting unhandledRejection', async () => {
    const unhandled = jest.fn()
    process.on('unhandledRejection', unhandled)
    loadBoot({ registerThrows: true })
    await flush()
    await jest.advanceTimersByTimeAsync(20001)
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('synchronous registration failure')
    )
    expect(unhandled).not.toHaveBeenCalled()
    process.removeListener('unhandledRejection', unhandled)
  })

  it('fires native load even when host script downloads stall', async () => {
    const requested: string[] = []
    let requestedBoth!: () => void
    const bothRequested = new Promise<void>((resolve) => {
      requestedBoth = resolve
    })
    const intercept = requestInterceptor((request) => {
      const url = request.url
      if (url.includes('/host/boot.js')) return new Response(source)
      if (
        url.includes('/host/persist.js') ||
        url.includes('/host/intercept.js')
      ) {
        requested.push(url)
        if (requested.length === 2) requestedBoth()
        return new Promise<Response>(() => {})
      }
      throw new Error(`Unexpected resource request: ${url}`)
    })
    jest.useRealTimers()
    const dom = new JSDOM(
      `<!doctype html><head><script src="/host/boot.js?v=abc123"></script><script>
      window.earlyReady = window.__sasjsMockReady;
      window.calls = ['app'];
      document.addEventListener('DOMContentLoaded', () => calls.push('dom'));
      window.addEventListener('load', async () => { calls.push('load'); await window.__sasjsMockReady; });
      </script></head><body>visible</body>`,
      {
        url: 'http://localhost/',
        runScripts: 'dangerously',
        resources: { interceptors: [intercept] } as any,
        virtualConsole: new VirtualConsole(),
        beforeParse(win: any) {
          Object.defineProperty(win.navigator, 'serviceWorker', {
            value: {
              register: () => Promise.resolve({}),
              ready: Promise.resolve({}),
              controller: { scriptURL: 'http://localhost/sw.js?v=abc123' },
              addEventListener() {},
              removeEventListener() {}
            }
          })
        }
      }
    )
    try {
      const fired = await Promise.race([
        new Promise<boolean>((resolve) =>
          dom.window.addEventListener('load', () => resolve(true), {
            once: true
          })
        ),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 300))
      ])
      expect(fired).toBe(true)
      const page: any = dom.window
      expect(page.earlyReady).toBe(page.__sasjsMockReady)
      expect(page.calls).toEqual(['app', 'dom', 'load'])
      expect(page.document.body.textContent).toContain('visible')
      await Promise.race([
        bothRequested,
        new Promise<void>((_, reject) =>
          setTimeout(
            () => reject(new Error('host scripts were not requested')),
            300
          )
        )
      ])
      expect(requested.sort()).toEqual([
        'http://localhost/host/intercept.js?v=abc123',
        'http://localhost/host/persist.js?v=abc123'
      ])
    } finally {
      dom.window.close()
    }
  })

  it('leaves native app scripts and lifecycle events under parser control while the worker is pending', async () => {
    const intercept = requestInterceptor((request) => {
      const url = request.url
      if (url.endsWith('/host/boot.js')) return new Response(source)
      if (url.endsWith('/host/persist.js'))
        return new Response(
          'window.__sasjsMockPersistReady = new Promise(() => {})'
        )
      if (url.endsWith('/host/intercept.js')) return new Response('')
      throw new Error(`Unexpected resource request: ${url}`)
    })
    jest.useRealTimers()
    const dom = new JSDOM(
      `<!doctype html><head><script src="/host/boot.js"></script><script>
      window.earlyReady = window.__sasjsMockReady;
      window.calls = ['app'];
      document.addEventListener('DOMContentLoaded', () => calls.push('dom'));
      window.addEventListener('load', () => calls.push('load'));
    </script></head><body>visible</body>`,
      {
        url: 'http://localhost/',
        runScripts: 'dangerously',
        resources: { interceptors: [intercept] } as any,
        virtualConsole: new VirtualConsole(),
        beforeParse(win: any) {
          Object.defineProperty(win.navigator, 'serviceWorker', {
            value: {
              register: () => new Promise(() => {}),
              ready: new Promise(() => {}),
              controller: null,
              addEventListener() {},
              removeEventListener() {}
            }
          })
        }
      }
    )
    await new Promise<void>((resolve) =>
      dom.window.addEventListener('load', () => resolve(), { once: true })
    )
    const page: any = dom.window
    expect(page.earlyReady).toBe(page.__sasjsMockReady)
    expect(page.earlyReady).toBeInstanceOf(dom.window.Promise)
    expect(page.calls).toEqual(['app', 'dom', 'load'])
    expect(page.document.body.textContent).toContain('visible')
    dom.window.close()
  })
})
