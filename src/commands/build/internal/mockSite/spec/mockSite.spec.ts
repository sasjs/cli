import fs from 'fs'
import path from 'path'
import { JSDOM } from 'jsdom'
import {
  buildMockSite,
  DRIVE_FORMAT,
  MAX_BINARY_SEED_BYTES,
  SHARD_FILE_BYTES
} from '../mockSite'

const appLoc = '/Public/app/test'
const languageVersion: string = JSON.parse(
  fs.readFileSync(
    path.resolve(
      path.dirname(require.resolve('@sasjs/sas-language/server/node')),
      '../../../../package.json'
    ),
    'utf8'
  )
).version

const write = (file: string, contents: string) => {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, contents)
}

const createProject = (root: string) => {
  // sasjsbuild is what `sasjs compile` leaves behind: every service folder
  // copied in, then the sync folder's contents over the root.
  const build = path.join(root, 'sasjsbuild')
  write(path.join(build, 'services', 'public', 'getdata.js'), 'const a = 1\n')
  write(
    path.join(build, 'services', 'public', 'viewtables.js'),
    'const a = 2\n'
  )
  write(path.join(build, 'services', 'admin', 'makedata.js'), 'const a = 3\n')
  write(
    path.join(build, 'mock-storage', 'licence.json'),
    '{"licenceKey":"invalid"}'
  )
  // root-level build artefacts must not reach the virtual drive
  write(path.join(build, 'server-ci.sas'), '%put build pack;\n')
  write(path.join(build, 'server-ci.json'), '{"members":[]}\n')
  write(
    path.join(root, 'client', 'dist', 'index.html'),
    [
      '<!doctype html><html><head><title>App</title>',
      '<link rel="stylesheet" href="theme-boot.css" />',
      '<script src="theme-boot.js" data-early></script>',
      // Both marked and unmarked modules retain the browser's deferred semantics.
      '<script src="deferred.js" type="module" data-early></script>',
      '</head><body>',
      `<sasjs serverurl="https://sas.example.com" apploc="${appLoc}" servertype="SASJS" loginmechanism="Redirected"></sasjs>`,
      '<script src="main.abc123.js" type="module"></script>',
      '</body></html>'
    ].join('\n')
  )
  write(
    path.join(root, 'client', 'dist', 'theme-boot.css'),
    'html { background-color: #121212 }\n'
  )
  write(
    path.join(root, 'client', 'dist', 'deferred.js'),
    'console.log("deferred")\n'
  )
  write(
    path.join(root, 'client', 'dist', 'theme-boot.js'),
    'document.documentElement.style.backgroundColor = "#121212"\n'
  )
  write(path.join(root, 'client', 'dist', 'main.abc123.js'), 'console.log(1)\n')
}

describe('browser-hosted build', () => {
  let root: string
  const out = () => path.join(root, 'sasjsbuild', 'mock')
  const target = (streamConfig: { [key: string]: any } = {}) =>
    ({
      appLoc,
      streamConfig: { webSourcePath: './client/dist', ...streamConfig }
    }) as any
  const readSeed = () =>
    JSON.parse(
      fs.readFileSync(path.join(out(), 'host', 'vfs-seed.json'), 'utf8')
    )
  const readConfig = () =>
    JSON.parse(
      fs.readFileSync(path.join(out(), 'host', 'mock-config.json'), 'utf8')
    )
  const readIndex = () =>
    JSON.parse(
      fs.readFileSync(path.join(out(), 'host', 'vfs-snapshot.json'), 'utf8')
    )
  const readShard = (id: number) =>
    JSON.parse(
      fs.readFileSync(
        path.join(out(), 'host', `vfs-snapshot-${id}.json`),
        'utf8'
      )
    ).files

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(require('os').tmpdir(), 'sasjs-mock-'))
    createProject(root)
    process.projectDir = root
    ;(process as any).sasjsConfig = { syncFolder: 'sasjs' }
    process.sasjsConstants = {
      buildDestinationFolder: path.join(root, 'sasjsbuild')
    } as any
    process.logger = { warn: jest.fn(), info: jest.fn() } as any
  })

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true })
  })

  it('ships the browser formatter and its on-demand vocabulary under the mount', async () => {
    await buildMockSite(target({ mockWebBasePath: '/demo' }))
    const language = path.join(out(), 'host', 'sas-language', languageVersion)
    expect(
      fs.existsSync(path.join(language, 'pubsdata', 'procedures.json'))
    ).toBe(true)
    expect(fs.existsSync(path.join(language, 'data'))).toBe(true)
    expect(
      fs.readFileSync(path.join(out(), 'host', 'lint-browser.js'), 'utf8')
    ).toContain(`sas-language/${languageVersion}/`)
  })

  it('boots in the head before preserved parser scripts with their attributes intact', async () => {
    const scripts = [
      '<script src="theme-boot.js" data-early></script>',
      '<script async defer src="main.abc123.js?mode=one" integrity="sha384-x" crossorigin="anonymous" nonce="n" data-custom="main.abc123.js?mode=one"></script>',
      '<script type="module" src="deferred.js"></script>',
      '<script>window.inlineText = "  unchanged  ";</script>',
      '<script type="application/ld+json">{"name":"app"}</script>'
    ]
    write(
      path.join(root, 'client', 'dist', 'index.html'),
      `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="script-src 'self'">${scripts[0]}</head><body>${scripts.slice(1).join('')}</body></html>`
    )

    await buildMockSite(target({ mockWebBasePath: '/demo' }))
    const html = fs.readFileSync(path.join(out(), 'index.html'), 'utf8')
    const tags = html.match(/<script\b[^>]*>[\s\S]*?<\/script>/g) || []
    expect(tags).toHaveLength(6)
    expect(tags[0]).toMatch(
      /^<script src="\/demo\/host\/boot\.js\?v=[0-9a-f]{10}"><\/script>$/
    )
    expect(html.indexOf(tags[0]!)).toBeLessThan(html.indexOf('</head>'))
    expect(html.indexOf('Content-Security-Policy')).toBeLessThan(
      html.indexOf(tags[0]!)
    )
    expect(tags[1]).toMatch(
      /^<script src="theme-boot\.js\?v=[0-9a-f]{10}" data-early><\/script>$/
    )
    expect(tags[2]).toMatch(
      /^<script async defer src="main\.abc123\.js\?v=[0-9a-f]{10}&amp;mode=one" integrity="sha384-x" crossorigin="anonymous" nonce="n" data-custom="main\.abc123\.js\?mode=one"><\/script>$/
    )
    expect(tags[3]).toMatch(
      /^<script type="module" src="deferred\.js\?v=[0-9a-f]{10}"><\/script>$/
    )
    expect(tags.slice(4)).toEqual(scripts.slice(3))
    expect(html).not.toContain('data-scripts')
    expect(html).not.toContain('rel="preload" as="script"')
  })

  it('versions owned script URLs before their fragment and preserves query encoding', async () => {
    write(
      path.join(root, 'client', 'dist', 'index.html'),
      `<html><head><script data-copy="main.abc123.js#view" src='main.abc123.js#view'></script></head><body><script src="main.abc123.js?one=1&amp;two=2#view"></script></body></html>`
    )
    await buildMockSite(target())
    const html = fs.readFileSync(path.join(out(), 'index.html'), 'utf8')
    expect(html).toMatch(
      /data-copy="main\.abc123\.js#view" src='main\.abc123\.js\?v=[0-9a-f]{10}#view'/
    )
    expect(html).toMatch(
      /src="main\.abc123\.js\?v=[0-9a-f]{10}&amp;one=1&amp;two=2#view"/
    )
  })

  it('versions script URLs with encoded query and fragment delimiters without corrupting markup', async () => {
    const scripts = [
      '<script async src="main.abc123.js&#63;mode=one&amp;two=2#view" nonce="n"></script>',
      "<script defer src='main.abc123.js&#x3f;mode=one&#35;view' data-copy='unchanged'></script>",
      '<script src="main.abc123.js?mode=one&#35;view" integrity="sha384-x"></script>',
      '<script src="main.abc123.js&quest;mode=one&num;view" crossorigin="anonymous"></script>'
    ]
    write(
      path.join(root, 'client', 'dist', 'index.html'),
      `<html><head></head><body>${scripts.join('')}</body></html>`
    )
    await buildMockSite(target())
    const html = fs.readFileSync(path.join(out(), 'index.html'), 'utf8')
    const hash = require('crypto')
      .createHash('md5')
      .update(
        fs.readFileSync(path.join(root, 'client', 'dist', 'main.abc123.js'))
      )
      .digest('hex')
      .slice(0, 10)
    const tags = html.match(/<script\b[^>]*>[\s\S]*?<\/script>/g) || []
    expect(tags.slice(1)).toEqual([
      `<script async src="main.abc123.js&#63;v=${hash}&amp;mode=one&amp;two=2#view" nonce="n"></script>`,
      `<script defer src='main.abc123.js&#x3f;v=${hash}&amp;mode=one&#35;view' data-copy='unchanged'></script>`,
      `<script src="main.abc123.js?v=${hash}&amp;mode=one&#35;view" integrity="sha384-x"></script>`,
      `<script src="main.abc123.js&quest;v=${hash}&amp;mode=one&num;view" crossorigin="anonymous"></script>`
    ])
  })

  it('versions unquoted script URLs with an empty query before the fragment', async () => {
    write(
      path.join(root, 'client', 'dist', 'index.html'),
      '<html><head><script src=main.abc123.js?#view defer></script></head><body></body></html>'
    )

    await buildMockSite(target())

    const html = fs.readFileSync(path.join(out(), 'index.html'), 'utf8')
    expect(html).toMatch(
      /<script src=main\.abc123\.js\?v=[0-9a-f]{10}#view defer><\/script>/
    )
    const dom = new JSDOM(html)
    const script = dom.window.document.querySelector('script[defer]')!
    expect(script.getAttribute('src')).toMatch(
      /^main\.abc123\.js\?v=[0-9a-f]{10}#view$/
    )
    dom.window.close()
  })

  it('leaves external and directory script URLs untouched', async () => {
    const scripts = [
      '<script src="//cdn.example.com/lib.js"></script>',
      '<script src="data:text/javascript,void(0)"></script>',
      '<script src="assets"></script>'
    ]
    fs.mkdirSync(path.join(root, 'client', 'dist', 'assets'))
    write(
      path.join(root, 'client', 'dist', 'index.html'),
      `<html><head>${scripts.join('')}</head><body></body></html>`
    )

    await buildMockSite(target())

    const html = fs.readFileSync(path.join(out(), 'index.html'), 'utf8')
    for (const script of scripts) expect(html).toContain(script)
  })

  it('only versions style links, including unquoted preloads, and leaves incomplete links alone', async () => {
    const unchanged = [
      '<link href="theme-boot.css">',
      '<link rel=preload href="theme-boot.css">',
      '<link rel=preload as=script href="theme-boot.css">',
      '<link rel=stylesheet disabled>'
    ]
    write(
      path.join(root, 'client', 'dist', 'index.html'),
      `<html><head>${unchanged.join('')}<link rel=preload as=style href=theme-boot.css><link rel='stylesheet' href='theme-boot.css'></head><body></body></html>`
    )

    await buildMockSite(target())

    const html = fs.readFileSync(path.join(out(), 'index.html'), 'utf8')
    for (const link of unchanged) expect(html).toContain(link)
    const dom = new JSDOM(html)
    const preload = dom.window.document.querySelector('link[as="style"]')!
    const stylesheet = dom.window.document.querySelector(
      'link[href^="theme-boot.css?"][rel="stylesheet"]'
    )!
    expect(preload.getAttribute('href')).toMatch(
      /^theme-boot\.css\?v=[0-9a-f]{10}$/
    )
    expect(stylesheet.getAttribute('href')).toBe(preload.getAttribute('href'))
    dom.window.close()
  })

  it('does not version a script outside the generated site', async () => {
    write(path.join(root, 'sasjsbuild', 'external.js'), 'external')
    write(
      path.join(root, 'client', 'dist', 'index.html'),
      '<html><head><script src="../external.js"></script></head><body></body></html>'
    )
    await buildMockSite(target())
    const html = fs.readFileSync(path.join(out(), 'index.html'), 'utf8')
    expect(html).toContain('<script src="../external.js"></script>')
  })

  it('lays the compile output out on the virtual drive', async () => {
    const result = await buildMockSite(target())

    expect(result.jsPrograms).toBe(3)
    expect(result.driveEntries).toBe(4) // 3 programs + the licence store

    const seed = readSeed()
    expect(
      seed.files[`/sasjs/drive/files${appLoc}/services/public/getdata.js`]
    ).toBe('const a = 1\n')
    expect(
      seed.files[`/sasjs/drive/files${appLoc}/mock-storage/licence.json`]
    ).toContain('licenceKey')
    // the service pack and its manifest stay out of the drive
    expect(Object.keys(seed.files).some((k) => k.endsWith('.sas'))).toBe(false)
    expect(
      Object.keys(seed.files).some((k) => k.endsWith('server-ci.json'))
    ).toBe(false)
  })

  it('stamps the config with the build, so a page can tell one drive from another', async () => {
    await buildMockSite(target())
    const first = readConfig()

    expect(first.buildStamp).toMatch(/^[0-9a-f]{10}$/)

    // an identical build keeps its stamp: a rebuild that changes nothing must
    // not throw a returning visitor's drive away
    await buildMockSite(target())
    expect(readConfig().buildStamp).toBe(first.buildStamp)

    // a changed service changes the stamp, which is what makes the page re-seed
    // rather than run the previous build's program
    fs.writeFileSync(
      path.join(root, 'sasjsbuild', 'services', 'public', 'getdata.js'),
      'const a = 999\n'
    )
    await buildMockSite(target())
    expect(readConfig().buildStamp).not.toBe(first.buildStamp)
  })

  it('stamps the seed with the drive format the runtime checks', async () => {
    await buildMockSite(target())

    // the runtime ships as a plain browser script and holds its own copy of the
    // marker format, so the seed carries the number and a mismatch is refused
    // there by name rather than decoded as text
    expect(readSeed().format).toBe(DRIVE_FORMAT)
  })

  it('writes the runtime host and the worker at the site root', async () => {
    await buildMockSite(target())

    for (const asset of [
      'md5.js',
      'runtime-core.js',
      'persist.js',
      'intercept.js',
      'boot.js',
      'api-browser.js',
      'lint-browser.js'
    ]) {
      expect(fs.existsSync(path.join(out(), 'host', asset))).toBe(true)
    }
    // a worker only controls the folder it is served from, so it has to sit at
    // the root rather than under host/
    expect(fs.existsSync(path.join(out(), 'sw.js'))).toBe(true)
    expect(fs.existsSync(path.join(out(), 'host', 'sw.js'))).toBe(false)
    expect(readConfig().appLoc).toBe(appLoc)
  })

  it('ships the @sasjs/api build the CLI resolves, and versions both imports', async () => {
    await buildMockSite(target())

    // the same file the installed package carries: a vendored copy is exactly
    // how the worker and the server drift apart
    const shipped = fs.readFileSync(path.join(out(), 'host', 'api-browser.js'))
    const installed = fs.readFileSync(
      path.join(
        path.dirname(require.resolve('@sasjs/api')),
        '..',
        '..',
        'build',
        'browser.js'
      )
    )
    expect(shipped.equals(installed)).toBe(true)

    const sw = fs.readFileSync(path.join(out(), 'sw.js'), 'utf8')
    // both imports carry the host version: a worker caches what it imports, so
    // a rebuild that changes either file has to change the URL
    expect(sw).toMatch(
      /importScripts\('host\/runtime-core\.js\?v=[0-9a-f]{10}'\)/
    )
    expect(sw).toMatch(
      /importScripts\('host\/api-browser\.js\?v=[0-9a-f]{10}'\)/
    )
    expect(sw).toMatch(
      /importScripts\('host\/lint-browser\.js\?v=[0-9a-f]{10}'\)/
    )
    expect(sw).not.toContain("importScripts('/host/runtime-core.js')")
  })

  it('resolves the same linter for the API code service and CLI', () => {
    const cliLint = require.resolve('@sasjs/lint/package.json')
    const apiEntry = require.resolve('@sasjs/api/code')
    const apiLint = require.resolve('@sasjs/lint/package.json', {
      paths: [path.dirname(apiEntry)]
    })
    expect(apiLint).toBe(cliLint)
  })

  it('bundles the linter from the installed packages, ready for a worker', async () => {
    await buildMockSite(target())

    const bundle = fs.readFileSync(
      path.join(out(), 'host', 'lint-browser.js'),
      'utf8'
    )
    // the bundle carries the package's code service, not a second linter
    expect(bundle).toContain('SASjsCode')
    expect(bundle).toContain('createCodeService')

    // and it runs: evaluating it in a bare realm exposes the factory and the
    // configuration class a host builds from its own rules file
    const vm = require('vm')
    const realm: any = { globalThis: null, console }
    realm.globalThis = realm
    vm.createContext(realm)
    vm.runInContext(bundle, realm)
    expect(typeof realm.SASjsCode.createCodeService).toBe('function')
    expect(typeof realm.SASjsCode.LintConfig).toBe('function')
  })

  it('names the package when its browser build is missing, and keeps the previous site', async () => {
    await buildMockSite(target())
    write(path.join(out(), 'stale.txt'), 'previous')

    // The walk from require.resolve is the only thing that knows where the
    // build is, so an install without it (or a package that stops publishing
    // it) has to say so - not surface as an ENOENT from a path three levels up.
    // Reported missing for that one path only, so the rest of the build keeps
    // its real filesystem.
    const browserBuild = path.join(
      path.dirname(require.resolve('@sasjs/api')),
      '..',
      '..',
      'build',
      'browser.js'
    )
    const exists = jest.spyOn(fs, 'existsSync')
    exists.mockImplementation((checked) => String(checked) !== browserBuild)
    try {
      await expect(buildMockSite(target())).rejects.toThrow(
        /@sasjs\/api browser build is missing/
      )
    } finally {
      exists.mockRestore()
    }

    // and the refusal lands before anything is written, so the site that was
    // there is still there
    expect(fs.existsSync(path.join(out(), 'stale.txt'))).toBe(true)
    expect(fs.readFileSync(path.join(out(), 'stale.txt'), 'utf8')).toBe(
      'previous'
    )
  })

  /**
   * The worker's scripts share one global scope, so a name declared at the top
   * level of two of them is a SyntaxError in the browser - and invisible to this
   * suite, where each file is a module of its own. `importScripts` is the
   * browser's rule: evaluate the files the build wrote, in one context, once.
   */
  it('evaluates the shipped scripts in one global scope, the way a worker does', async () => {
    await buildMockSite(target())
    const vm = require('vm')

    const sandbox: any = {
      console,
      Request,
      Response,
      Headers,
      URL,
      FormData,
      Blob,
      TextEncoder,
      TextDecoder,
      Uint8Array,
      ArrayBuffer,
      atob,
      btoa,
      setTimeout,
      clearTimeout,
      location: { origin: 'https://mock.example.com' },
      clients: { claim: () => {}, matchAll: async () => [] },
      skipWaiting: () => {},
      addEventListener: () => {},
      fetch: async () =>
        new Response('{}', { headers: { 'content-type': 'application/json' } })
    }
    sandbox.self = sandbox
    const context = vm.createContext(sandbox)

    // a worker imports a URL once; md5.js is imported by the worker and again
    // by the runtime
    const imported = new Set<string>()
    sandbox.importScripts = (url: string) => {
      if (imported.has(url)) return
      imported.add(url)
      const file = path.join(out(), url.replace(/^\//, '').split('?')[0])
      vm.runInContext(fs.readFileSync(file, 'utf8'), context, {
        filename: file
      })
    }

    expect(() =>
      vm.runInContext(
        fs.readFileSync(path.join(out(), 'sw.js'), 'utf8'),
        context,
        {
          filename: 'sw.js'
        }
      )
    ).not.toThrow()

    // both scripts are loaded, and the drive the API is handed came from the
    // runtime rather than a second implementation
    expect(Object.keys(sandbox.SASjsMockRuntime)).toContain('driveStore')
    expect(typeof sandbox.SASjsApi.createDriveService).toBe('function')
  })

  it('ships the webout() block with sentinels the runtime fills in', async () => {
    await buildMockSite(target())

    const prelude = JSON.parse(
      fs.readFileSync(path.join(out(), 'host', 'webout-prelude.json'), 'utf8')
    )

    // The block is the one @sasjs/utils generates for the server. It travels
    // with sentinel values because the run's paths and user are not known at
    // build time, and the sentinel names travel with it so the two sides cannot
    // disagree about them.
    expect(prelude.template).toContain('webout(')
    expect(prelude.template).toContain('_sasjs_webout.finalise')
    expect(prelude.template).toContain('content-type: application/json')
    expect(prelude.sentinels.weboutPath).toEqual('__SASJS_WEBOUT_PATH__')

    for (const sentinel of Object.values(prelude.sentinels)) {
      expect(prelude.template).toContain(JSON.stringify(sentinel))
    }
  })

  it.each([
    '<sasjs serverurl="old"></sasjs>',
    '<sasjs serverurl="old">',
    '<sasjs serverurl="old"/>'
  ])('uses one early mount script for scripts around %s', async (tag) => {
    write(
      path.join(root, 'client', 'dist', 'index.html'),
      `<html><head><script src="early.js"></script></head><body>${tag}<script src="late.js"></script></body></html>`
    )
    write(
      path.join(root, 'client', 'dist', 'early.js'),
      'window.early = { config: document.querySelector("sasjs")?.getAttribute("serverurl") ?? null, observer: !!window.__sasjsMountObserver }'
    )
    write(
      path.join(root, 'client', 'dist', 'late.js'),
      'window.late = document.querySelector("sasjs").getAttribute("serverurl")'
    )
    await buildMockSite(target({ mockWebBasePath: '/demo' }))
    const html = fs.readFileSync(path.join(out(), 'index.html'), 'utf8')
    const parsed = new JSDOM(html)
    const mountScripts = parsed.window.document.querySelectorAll(
      'script[src*="/host/mount-config.js?"]'
    )
    expect(mountScripts).toHaveLength(1)
    expect(
      mountScripts[0]!.compareDocumentPosition(
        parsed.window.document.querySelector('script[src^="early.js"]')!
      ) & 4
    ).toBeTruthy()
    parsed.window.close()

    const { ResourceLoader } = require('jsdom')
    class Assets extends ResourceLoader {
      fetch(url: string): Promise<Buffer> | null {
        const pathname = new URL(url).pathname.replace(/^\/demo\//, '')
        if (pathname === 'host/boot.js') return Promise.resolve(Buffer.from(''))
        const file = path.join(out(), pathname)
        return fs.existsSync(file)
          ? Promise.resolve(fs.readFileSync(file))
          : null
      }
    }
    const dom = new JSDOM(html, {
      url: 'https://example.com/demo/',
      resources: new Assets() as any,
      runScripts: 'dangerously'
    })
    await new Promise<void>((resolve) =>
      dom.window.addEventListener('load', () => resolve())
    )
    expect(
      (dom.window as any).early.observer ||
        (dom.window as any).early.config === 'https://example.com/demo'
    ).toBe(true)
    expect((dom.window as any).late).toBe('https://example.com/demo')
    dom.window.close()
  })

  it('never exposes a relative mount to an async app while a parser script is delayed', async () => {
    write(
      path.join(root, 'client', 'dist', 'index.html'),
      '<html><head><script async src="async-app.js"></script></head><body><sasjs serverurl="old"></sasjs></body></html>'
    )
    write(path.join(root, 'client', 'dist', 'async-app.js'), 'unused')
    await buildMockSite(target({ mockWebBasePath: '/demo' }))
    // Model a parser-blocking script held after the config: the generated early
    // observer must stamp it before the async app runs, even while parsing stalls.
    const html = fs
      .readFileSync(path.join(out(), 'index.html'), 'utf8')
      .replace('</sasjs>', '<script src="/demo/held.js"></script></sasjs>')
    const { ResourceLoader } = require('jsdom')
    let releaseMount!: () => void
    let releaseApp!: () => void
    const appReady = new Promise<Buffer>((resolve) => {
      releaseApp = () =>
        resolve(
          Buffer.from(`
        function observe() {
          var config = document.querySelector('sasjs');
          if (!config) return setTimeout(observe, 0);
          window.observed = config.getAttribute('serverurl');
        }
        observe();
      `)
        )
    })
    let mountRequested!: () => void
    const requested = new Promise<void>((resolve) => (mountRequested = resolve))
    const mountReady = new Promise<Buffer>((resolve) => {
      releaseMount = () => resolve(Buffer.from(''))
    })
    class Assets extends ResourceLoader {
      fetch(url: string): Promise<Buffer> | null {
        const name = new URL(url).pathname.split('/').pop()
        if (name === 'boot.js') return Promise.resolve(Buffer.from(''))
        if (name === 'async-app.js') return appReady
        if (name === 'mount-config.js')
          return Promise.resolve(
            fs.readFileSync(path.join(out(), 'host', name))
          )
        if (name === 'held.js') {
          mountRequested()
          return mountReady
        }
        return null
      }
    }
    const dom = new JSDOM(html, {
      url: 'https://example.com/demo/',
      resources: new Assets() as any,
      runScripts: 'dangerously'
    })
    await requested
    releaseApp()
    // Give the async script an opportunity to run while the mount response is held.
    await new Promise((resolve) => setTimeout(resolve, 50))
    const observedWhileHeld = (dom.window as any).observed
    releaseMount()
    await new Promise<void>((resolve) =>
      dom.window.addEventListener('load', () => resolve())
    )
    dom.window.close()
    expect(observedWhileHeld).toBe('https://example.com/demo')
  })

  it('provides an absolute mounted server URL before the app reads its config', async () => {
    write(
      path.join(root, 'client', 'dist', 'index.html'),
      '<html><head></head><body><sasjs serverurl="https://old.example" apploc="/old" servertype="SASJS" loginmechanism="Redirected"></sasjs><script>window.observedServerUrl = document.querySelector("sasjs").getAttribute("serverurl")</script></body></html>'
    )
    await buildMockSite(target({ mockWebBasePath: '/demo/nested' }))
    const html = fs.readFileSync(path.join(out(), 'index.html'), 'utf8')
    for (const origin of ['http://127.0.0.1:8123', 'https://example.com']) {
      const { ResourceLoader } = require('jsdom')
      class Assets extends ResourceLoader {
        fetch(url: string): Promise<Buffer> | null {
          const name = new URL(url).pathname.split('/').pop()
          if (name === 'boot.js') return Promise.resolve(Buffer.from(''))
          const file = path.join(out(), 'host', name!)
          return fs.existsSync(file)
            ? Promise.resolve(fs.readFileSync(file))
            : null
        }
      }
      const dom = new JSDOM(html, {
        url: `${origin}/demo/nested/`,
        resources: new Assets() as any,
        runScripts: 'dangerously'
      })
      await new Promise<void>((resolve) =>
        dom.window.addEventListener('load', () => resolve())
      )
      expect((dom.window as any).observedServerUrl).toBe(
        `${origin}/demo/nested`
      )
      dom.window.close()
    }
  })

  it.each([
    "<sasjs serverurl='https://old.example'/>",
    "<sasjs serverurl='https://old.example'>",
    "<sasjs serverurl='https://old.example'></sasjs>"
  ])(
    'stamps an unclosed config before the following app script: %s',
    async (tag) => {
      write(
        path.join(root, 'client', 'dist', 'index.html'),
        `<html><head></head><body>${tag}<script>window.observedServerUrl = document.querySelector('sasjs').getAttribute('serverurl')</script></body></html>`
      )
      await buildMockSite(target({ mockWebBasePath: '/demo' }))
      const html = fs.readFileSync(path.join(out(), 'index.html'), 'utf8')
      const { ResourceLoader } = require('jsdom')
      class Assets extends ResourceLoader {
        fetch(url: string): Promise<Buffer> | null {
          const name = new URL(url).pathname.split('/').pop()
          if (name === 'boot.js') return Promise.resolve(Buffer.from(''))
          const file = path.join(out(), 'host', name!)
          return fs.existsSync(file)
            ? Promise.resolve(fs.readFileSync(file))
            : null
        }
      }
      const dom = new JSDOM(html, {
        url: 'https://example.com/demo/',
        resources: new Assets() as any,
        runScripts: 'dangerously'
      })
      await new Promise<void>((resolve) =>
        dom.window.addEventListener('load', () => resolve())
      )
      expect((dom.window as any).observedServerUrl).toBe(
        'https://example.com/demo'
      )
      dom.window.close()
    }
  )

  it('stamps before an app script nested inside the config element', async () => {
    write(
      path.join(root, 'client', 'dist', 'index.html'),
      `<html><head></head><body><sasjs serverurl="old"><script>window.observed = document.querySelector('sasjs').getAttribute('serverurl')</script></sasjs></body></html>`
    )
    await buildMockSite(target({ mockWebBasePath: '/demo' }))
    const { ResourceLoader } = require('jsdom')
    class Assets extends ResourceLoader {
      fetch(url: string): Promise<Buffer> | null {
        const name = new URL(url).pathname.split('/').pop()
        if (name === 'boot.js') return Promise.resolve(Buffer.from(''))
        const file = path.join(out(), 'host', name!)
        return fs.existsSync(file)
          ? Promise.resolve(fs.readFileSync(file))
          : null
      }
    }
    const dom = new JSDOM(
      fs.readFileSync(path.join(out(), 'index.html'), 'utf8'),
      {
        url: 'https://example.com/demo/',
        resources: new Assets() as any,
        runScripts: 'dangerously'
      }
    )
    await new Promise<void>((resolve) =>
      dom.window.addEventListener('load', () => resolve())
    )
    expect((dom.window as any).observed).toBe('https://example.com/demo')
    dom.window.close()
  })

  it.each(['SASVIYA', 'SASJS'])(
    'preserves frontend adapter type and appLoc for a %s target',
    async (serverType) => {
      const source = `<html><head></head><body><sasjs serverurl="old" servertype="SASJS" apploc="/frontend/app" loginmechanism="Redirected"></sasjs><script>const c = document.querySelector('sasjs'); window.adapter = new window.SASjs({serverUrl: c.getAttribute('serverurl'), serverType: c.getAttribute('servertype'), appLoc: c.getAttribute('apploc'), loginMechanism: c.getAttribute('loginmechanism')})</script></body></html>`
      write(path.join(root, 'client', 'dist', 'index.html'), source)
      await buildMockSite({ ...target(), serverType, appLoc: '/target/app' })
      const dom = new JSDOM(
        fs.readFileSync(path.join(out(), 'index.html'), 'utf8'),
        {
          url: 'https://example.com/',
          runScripts: 'dangerously',
          beforeParse(window) {
            ;(window as any).SASjs = require('@sasjs/adapter').default
          }
        }
      )
      const config = (dom.window as any).adapter.sasjsConfig
      expect(config.serverType).toBe('SASJS')
      expect(config.appLoc).toBe('/frontend/app')
      expect(config.loginMechanism).toBe('Default')
      dom.window.close()
    }
  )

  it.each(['SASVIYA', 'SASJS'])(
    'does not add absent adapter type or appLoc for a %s target',
    async (serverType) => {
      write(
        path.join(root, 'client', 'dist', 'index.html'),
        '<html><head></head><body><sasjs serverurl="old"></sasjs></body></html>'
      )
      await buildMockSite({ ...target(), serverType })
      const dom = new JSDOM(
        fs.readFileSync(path.join(out(), 'index.html'), 'utf8')
      )
      const config = dom.window.document.querySelector('sasjs')!
      expect(config.hasAttribute('servertype')).toBe(false)
      expect(config.hasAttribute('apploc')).toBe(false)
      dom.window.close()
    }
  )

  it('configures the copied app for a SAS9 target and its mounted mock host', async () => {
    const source = path.join(root, 'client', 'dist', 'index.html')
    const original = fs.readFileSync(source, 'utf8')
    const loc = '/Shared/SAS9/demo'
    await buildMockSite({
      ...target({ mockWebBasePath: '/demo' }),
      serverType: 'SAS9',
      appLoc: loc
    })

    const html = fs.readFileSync(path.join(out(), 'index.html'), 'utf8')
    const dom = new JSDOM(html, { url: 'https://example.com/demo/' })
    const config = dom.window.document.querySelector('sasjs')!
    expect(config.getAttribute('servertype')).toBe('SAS9')
    expect(config.getAttribute('apploc')).toBe(loc)
    expect(config.getAttribute('serverurl')).toBe('/demo')
    expect(
      new URL(config.getAttribute('serverurl')!, dom.window.location.href).href
    ).toBe('https://example.com/demo')
    expect(config.getAttribute('loginmechanism')).toBe('Default')
    expect(fs.readFileSync(source, 'utf8')).toBe(original)
    dom.window.close()
  })

  it('rewrites actual SASjs attributes with HTML quoting and preserves other markup', async () => {
    const source = `<!doctype html><html><head></head><body><!-- <sasjs servertype="DECOY"> --><sasjs serverurl='https://old.example' servertype=SASJS apploc='/old' loginmechanism='Redirected' data-value='keep'></sasjs></body></html>`
    write(path.join(root, 'client', 'dist', 'index.html'), source)
    const loc = '/Public/A&B "quoted"'
    await buildMockSite({ ...target(), appLoc: loc, serverType: 'SAS9' })
    const html = fs.readFileSync(path.join(out(), 'index.html'), 'utf8')
    const dom = new JSDOM(html)
    const config = dom.window.document.querySelector('sasjs')!
    expect(config.getAttribute('serverurl')).toBe('')
    expect(config.getAttribute('servertype')).toBe('SAS9')
    expect(config.getAttribute('apploc')).toBe(loc)
    expect(config.getAttribute('loginmechanism')).toBe('Default')
    expect(config.getAttribute('data-value')).toBe('keep')
    expect(html).toContain('<!-- <sasjs servertype="DECOY"> -->')
    dom.window.close()
  })

  it('stamps missing config attributes for an app that reads them', async () => {
    const source =
      '<html><head></head><body><sasjs data-custom="keep"></sasjs><script>const c = document.querySelector("sasjs"); window.adapter = new window.SASjs({serverUrl: c.getAttribute("serverurl"), serverType: c.getAttribute("servertype"), appLoc: c.getAttribute("apploc"), loginMechanism: c.getAttribute("loginmechanism")})</script></body></html>'
    write(path.join(root, 'client', 'dist', 'index.html'), source)
    await buildMockSite({
      ...target({ mockWebBasePath: '/demo' }),
      serverType: 'SAS9'
    })
    const html = fs.readFileSync(path.join(out(), 'index.html'), 'utf8')
    const { ResourceLoader } = require('jsdom')
    class Assets extends ResourceLoader {
      fetch(url: string): Promise<Buffer> | null {
        const name = new URL(url).pathname.split('/').pop()
        if (name === 'boot.js') return Promise.resolve(Buffer.from(''))
        const file = path.join(out(), 'host', name!)
        return fs.existsSync(file)
          ? Promise.resolve(fs.readFileSync(file))
          : null
      }
    }
    const dom = new JSDOM(html, {
      url: 'https://example.com/demo/',
      resources: new Assets() as any,
      runScripts: 'dangerously',
      beforeParse(window) {
        ;(window as any).SASjs = require('@sasjs/adapter').default
      }
    })
    await new Promise<void>((resolve) =>
      dom.window.addEventListener('load', () => resolve())
    )
    const config = (dom.window as any).adapter.sasjsConfig
    expect(config.serverUrl).toBe('https://example.com/demo')
    expect(config.serverType).toBe('SAS9')
    expect(config.appLoc).toBe(appLoc)
    expect(config.loginMechanism).toBe('Default')
    expect(
      dom.window.document.querySelector('sasjs')!.getAttribute('data-custom')
    ).toBe('keep')
    expect(
      fs.readFileSync(path.join(root, 'client', 'dist', 'index.html'), 'utf8')
    ).toBe(source)
    dom.window.close()
  })

  it('warns that apps ignoring missing DOM attributes can still use incompatible defaults', async () => {
    write(
      path.join(root, 'client', 'dist', 'index.html'),
      '<html><head></head><body><sasjs></sasjs><script>window.adapter = new window.SASjs()</script></body></html>'
    )
    await buildMockSite({ ...target(), serverType: 'SAS9' })
    const dom = new JSDOM(
      fs.readFileSync(path.join(out(), 'index.html'), 'utf8'),
      {
        runScripts: 'dangerously',
        beforeParse(window) {
          ;(window as any).SASjs = require('@sasjs/adapter').default
        }
      }
    )
    expect((dom.window as any).adapter.sasjsConfig.serverType).not.toBe('SAS9')
    expect((dom.window as any).adapter.sasjsConfig.appLoc).not.toBe(appLoc)
    expect(process.logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('ignores')
    )
    dom.window.close()
  })

  it('serves the site under a folder when the target names one', async () => {
    await buildMockSite(target({ mockWebBasePath: '/demo' }))

    const html = fs.readFileSync(path.join(out(), 'index.html'), 'utf8')
    expect(html).toContain('serverurl="/demo"')
    // the boot tag is absolute and names the folder, so a page at `/demo` with
    // no trailing slash still loads the loader from `/demo/host/`
    expect(html).toContain('<script src="/demo/host/boot.js?v=')
  })

  it('resolves the boot script at the site root even with base metadata', async () => {
    const cases = [
      {
        html: '<html><head><base href="/other/"></head><body></body></html>',
        base: '',
        url: 'https://example.com/',
        expected: '/host/boot.js'
      },
      {
        html: '<html><head><base href="/other/"></head><body></body></html>',
        base: '/demo',
        url: 'https://example.com/demo',
        expected: '/demo/host/boot.js'
      },
      {
        html: '<html><base href="/other/"><body><script>window.app = true</script></body></html>',
        base: '',
        url: 'https://example.com/',
        expected: '/host/boot.js'
      }
    ]
    for (const entry of cases) {
      write(path.join(root, 'client', 'dist', 'index.html'), entry.html)
      await buildMockSite(target({ mockWebBasePath: entry.base }))
      const html = fs.readFileSync(path.join(out(), 'index.html'), 'utf8')
      const dom = new JSDOM(html, { url: entry.url })
      const boot = dom.window.document.querySelector(
        'script[src*="host/boot.js"]'
      ) as HTMLScriptElement
      expect(boot).not.toBeNull()
      expect(new URL(boot.src, entry.url).origin).toBe('https://example.com')
      expect(new URL(boot.src, entry.url).pathname).toBe(entry.expected)
      expect(html.indexOf('<base')).toBeLessThan(html.indexOf('host/boot.js'))
      dom.window.close()
    }
  })

  it('refuses a base path that is not a folder path', async () => {
    await expect(
      buildMockSite(target({ mockWebBasePath: '/demo?x=1' }))
    ).rejects.toThrow(/mockWebBasePath/)
    await expect(
      buildMockSite(target({ mockWebBasePath: '../escape' }))
    ).rejects.toThrow(/mockWebBasePath/)
  })

  it('normalises the folder shapes the released build already accepts', async () => {
    // a patch release must not fail a configuration that builds today, so a
    // trailing slash, surrounding space and a bare name are normalised
    for (const value of ['/demo/', ' /demo ', 'demo']) {
      await buildMockSite(target({ mockWebBasePath: value }))
      const html = fs.readFileSync(path.join(out(), 'index.html'), 'utf8')
      expect(html).toContain('serverurl="/demo"')
    }

    // explicit empty is the origin root, as it was before the option existed
    await buildMockSite(target({ mockWebBasePath: '' }))
    const html = fs.readFileSync(path.join(out(), 'index.html'), 'utf8')
    expect(html).toContain('serverurl=""')
  })

  it('keeps early scripts and modules in place after the host', async () => {
    await buildMockSite(target())
    const html = fs.readFileSync(path.join(out(), 'index.html'), 'utf8')
    expect(html.indexOf('host/boot.js')).toBeLessThan(
      html.indexOf('theme-boot.js')
    )
    expect(html).toMatch(
      /<script src="theme-boot\.js\?v=[0-9a-f]{10}" data-early><\/script>/
    )
    expect(html).toMatch(
      /<script src="deferred\.js\?v=[0-9a-f]{10}" type="module" data-early><\/script>/
    )
    expect(process.logger.warn).not.toHaveBeenCalledWith(
      expect.stringContaining('a data-early script is a module')
    )
  })

  it('gives a linked stylesheet a URL that follows its contents', async () => {
    // the host caches an asset for two hours: a palette change behind an
    // unchanged URL reaches a returning reader late, which for the canvas
    // stylesheet is the white flash the fix exists to remove
    await buildMockSite(target())

    const html = fs.readFileSync(path.join(out(), 'index.html'), 'utf8')

    expect(html).toMatch(
      /<link rel="stylesheet" href="theme-boot\.css\?v=[0-9a-f]{10}" \/>/
    )
  })

  it('leaves classic and module scripts in the page without replay preloads', async () => {
    write(
      path.join(root, 'client', 'dist', 'index.html'),
      '<html><head></head><body><script src="main.abc123.js"></script><script src="deferred.js" type="module"></script></body></html>'
    )
    await buildMockSite(target())
    const html = fs.readFileSync(path.join(out(), 'index.html'), 'utf8')
    expect(html).toMatch(
      /<script src="main\.abc123\.js\?v=[0-9a-f]{10}"><\/script>/
    )
    expect(html).toMatch(
      /<script src="deferred\.js\?v=[0-9a-f]{10}" type="module"><\/script>/
    )
    expect(html).not.toContain('rel="preload" as="script"')
  })

  it('leaves a script this build does not own unhinted', async () => {
    // a page may load a script from somewhere else; a version guess or a
    // cross-origin hint only breaks it
    write(
      path.join(root, 'client', 'dist', 'index.html'),
      [
        '<!doctype html><html><head><title>App</title></head><body>',
        `<sasjs serverurl="https://sas.example.com" apploc="${appLoc}" servertype="SASJS"></sasjs>`,
        '<script src="https://cdn.example.com/lib.js"></script>',
        '<script src="not-in-this-build.js"></script>',
        '</body></html>'
      ].join('\n')
    )

    await buildMockSite(target())

    const html = fs.readFileSync(path.join(out(), 'index.html'), 'utf8')
    expect(html).not.toContain('rel="preload"')
  })

  it("leaves a stylesheet alone when the file is not this build's", async () => {
    // a file this build does not own: guessing a version for it would break it.
    // A URL that pins an `integrity` hash is versioned like any other - SRI
    // digests the fetched bytes, so a `?v=` URL still satisfies the hash.
    write(
      path.join(root, 'client', 'dist', 'index.html'),
      [
        '<!doctype html><html><head><title>App</title>',
        '<link rel="stylesheet" href="https://cdn.example.com/lib.css" />',
        '<link rel="stylesheet" href="theme-boot.css" integrity="sha384-abc" crossorigin="anonymous" />',
        '</head><body>',
        `<sasjs serverurl="https://sas.example.com" apploc="${appLoc}"></sasjs>`,
        '<script src="main.abc123.js" type="module" integrity="sha384-def"></script>',
        '</body></html>'
      ].join('\n')
    )

    await buildMockSite(target())

    const html = fs.readFileSync(path.join(out(), 'index.html'), 'utf8')
    // not owned by this build: untouched
    expect(html).toContain('href="https://cdn.example.com/lib.css"')

    // owned, hashed: versioned, hash carried through
    expect(html).toMatch(
      /href="theme-boot\.css\?v=[0-9a-f]{10}" integrity="sha384-abc" crossorigin="anonymous"/
    )
    expect(html).toMatch(
      /<script src="main\.abc123\.js\?v=[0-9a-f]{10}" type="module" integrity="sha384-def"><\/script>/
    )
  })

  it('does not let a $ in a file name rewrite the page', async () => {
    // `String.prototype.replace` interprets `$&`, `$1` and the rest in a
    // replacement STRING, and these tags carry the page's own file names - so a
    // `$&` in one would splice the matched markup into the src
    write(
      path.join(root, 'client', 'dist', '$&x.js'),
      'console.log("dollar")\n'
    )
    write(
      path.join(root, 'client', 'dist', 'index.html'),
      [
        '<!doctype html><html><head><title>App</title>',
        '<script src="$&x.js" data-early></script>',
        '</head><body>',
        `<sasjs serverurl="https://sas.example.com" apploc="${appLoc}"></sasjs>`,
        '<script src="main.abc123.js"></script>',
        '</body></html>'
      ].join('\n')
    )

    await buildMockSite(target())

    const html = fs.readFileSync(path.join(out(), 'index.html'), 'utf8')

    expect(html).toContain(
      `<script src="$&x.js?v=${require('crypto')
        .createHash('md5')
        .update(fs.readFileSync(path.join(root, 'client', 'dist', '$&x.js')))
        .digest('hex')
        .slice(0, 10)}" data-early></script>`
    )
    // one script tag, not a nested one spliced in by the expansion
    expect(html.split('<script').length - 1).toBe(3) // both app tags + the host
  })

  it('versions a preload of the same stylesheet', async () => {
    // a preload left at the unversioned URL warms one cache entry while the
    // stylesheet is fetched cold at another, which is the request it existed to save
    write(
      path.join(root, 'client', 'dist', 'index.html'),
      [
        '<!doctype html><html><head><title>App</title>',
        '<link rel="preload" as="style" href="theme-boot.css" />',
        '<link rel="stylesheet" href="theme-boot.css" />',
        '</head><body>',
        `<sasjs serverurl="https://sas.example.com" apploc="${appLoc}"></sasjs>`,
        '<script src="main.abc123.js"></script>',
        '</body></html>'
      ].join('\n')
    )

    await buildMockSite(target())

    const html = fs.readFileSync(path.join(out(), 'index.html'), 'utf8')
    const urls = [...html.matchAll(/theme-boot\.css\?v=([0-9a-f]{10})/g)].map(
      (match) => match[1]
    )

    expect(urls).toHaveLength(2)
    expect(urls[0]).toBe(urls[1])
  })

  it('installs the host when the only app script is early', async () => {
    write(
      path.join(root, 'client', 'dist', 'index.html'),
      '<html><head><script src="theme-boot.js" data-early></script></head><body></body></html>'
    )
    await buildMockSite(target())
    const html = fs.readFileSync(path.join(out(), 'index.html'), 'utf8')
    expect(html.indexOf('host/boot.js')).toBeLessThan(
      html.indexOf('theme-boot.js')
    )
    expect(html).not.toContain('data-scripts')
    expect(process.logger.warn).not.toHaveBeenCalledWith(
      expect.stringContaining('no script tags found')
    )
  })

  it('points the app at itself and installs the boot host', async () => {
    await buildMockSite(target())
    const html = fs.readFileSync(path.join(out(), 'index.html'), 'utf8')
    expect(html).toContain('serverurl=""')
    expect(html).toContain('loginmechanism="Default"')
    expect(html).not.toContain('https://sas.example.com')
    expect(html).toMatch(
      /<script src="\/host\/boot\.js\?v=[0-9a-f]{10}"><\/script>/
    )
    expect(html).not.toContain('<script>')
    expect(fs.existsSync(path.join(out(), 'host', 'boot.js'))).toBe(true)
    expect(html).toMatch(
      /<script src="main\.abc123\.js\?v=[0-9a-f]{10}" type="module"><\/script>/
    )
  })

  /**
   * A publish that changes only the app has to reach a reader whose browser
   * still holds the previous copy. The host caches an asset for two hours and the
   * bundle's name never changes, so the URL is what has to change.
   */
  it('gives each app script a URL that follows its contents', async () => {
    const bundleSrc = () => {
      const html = fs.readFileSync(path.join(out(), 'index.html'), 'utf8')
      return html.match(/src="(main\.abc123\.js[^\"]*)"/)?.[1]
    }

    await buildMockSite(target())
    const first = bundleSrc()

    expect(first).toMatch(/^main\.abc123\.js\?v=[0-9a-f]{10}$/)

    // the same file twice: nothing about the URL changes
    await buildMockSite(target())
    expect(bundleSrc()).toBe(first)

    // a different bundle: a different URL, which is the caching bust
    write(
      path.join(root, 'client', 'dist', 'main.abc123.js'),
      'console.log(2)\n'
    )
    await buildMockSite(target())
    expect(bundleSrc()).not.toBe(first)

    // and a script this build does not own is left exactly as the page asked
    write(
      path.join(root, 'client', 'dist', 'index.html'),
      [
        '<!doctype html><html><head><title>App</title></head><body>',
        `<sasjs serverurl="https://sas.example.com" apploc="${appLoc}"></sasjs>`,
        '<script src="https://cdn.example.com/lib.js"></script>',
        '</body></html>'
      ].join('\n')
    )
    await buildMockSite(target())
    expect(fs.readFileSync(path.join(out(), 'index.html'), 'utf8')).toContain(
      '<script src="https://cdn.example.com/lib.js"></script>'
    )
  })

  it('states in the page that the API is answered here', async () => {
    await buildMockSite(target())

    const html = fs.readFileSync(path.join(out(), 'index.html'), 'utf8')

    // The interface reads this to tell a browser host from a server: the API
    // cannot, because a browser host answers the same routes and the same
    // /SASjsApi/info shape. Only the host knows, so the host says.
    const tag = '<meta name="sasjs-host" content="browser" />'
    expect(html).toContain(tag)
    expect(html.indexOf(tag)).toBeLessThan(html.indexOf('</head>'))
    // once: the tag it inserts is the one the guard then finds
    expect(html.split('sasjs-host').length - 1).toBe(1)
  })

  it('leaves a page that already carries the host tag alone', async () => {
    write(
      path.join(root, 'client', 'dist', 'index.html'),
      [
        '<!doctype html><html><head>',
        '<meta name="sasjs-host" content="browser">',
        '</head><body><script src="main.abc123.js"></script></body></html>'
      ].join('\n')
    )

    await buildMockSite(target())

    const html = fs.readFileSync(path.join(out(), 'index.html'), 'utf8')
    expect(html.split('sasjs-host').length - 1).toBe(1)
  })

  it('inserts the tag when the page only mentions it outside the head', async () => {
    write(
      path.join(root, 'client', 'dist', 'index.html'),
      [
        '<!doctype html><html><head><title>App</title></head><body>',
        '<script src="main.abc123.js"></script>',
        '<template><meta name="sasjs-host" content="browser"></template>',
        '</body></html>'
      ].join('\n')
    )

    await buildMockSite(target())

    const html = fs.readFileSync(path.join(out(), 'index.html'), 'utf8')
    // the template's copy is not the page's tag: the head gets its own
    expect(html.split('sasjs-host').length - 1).toBe(2)
    expect(html.indexOf('content="browser" />')).toBeLessThan(
      html.indexOf('</head>')
    )
  })

  it('marks a page whose head is never closed', async () => {
    write(
      path.join(root, 'client', 'dist', 'index.html'),
      '<!doctype html><html><head><title>App</title><body><script src="main.abc123.js"></script></body></html>'
    )

    await buildMockSite(target())

    const html = fs.readFileSync(path.join(out(), 'index.html'), 'utf8')
    expect(html).toContain('<meta name="sasjs-host" content="browser" />')
  })

  it('warns when a page has no head to mark', async () => {
    write(
      path.join(root, 'client', 'dist', 'index.html'),
      '<!doctype html><html><body><script src="main.abc123.js"></script></body></html>'
    )

    await buildMockSite(target())

    expect(process.logger?.warn).toHaveBeenCalledWith(
      expect.stringContaining('no <head> element found')
    )
    const html = fs.readFileSync(path.join(out(), 'index.html'), 'utf8')
    expect(html).not.toContain('sasjs-host')
  })

  it.each([
    `<!doctype html><head><meta http-equiv="Content-Security-Policy" content="script-src 'none'"><div>App</div><script src="theme-boot.js"></script>`,
    `<!doctype html><html><meta http-equiv="Content-Security-Policy" content="script-src 'none'"></html>`,
    `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="script-src 'none'"></html>`,
    `<!doctype html><html><meta http-equiv="Content-Security-Policy" content="script-src 'none'"><body><script src="theme-boot.js"></script></body></html>`,
    `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="script-src 'none'">`,
    `<!doctype html><meta http-equiv="Content-Security-Policy" content="script-src 'none'">`
  ])(
    'keeps CSP effective before boot with implicit markup: %s',
    async (source) => {
      write(path.join(root, 'client', 'dist', 'index.html'), source)
      await buildMockSite(target())
      const html = fs.readFileSync(path.join(out(), 'index.html'), 'utf8')
      const dom = new JSDOM(html)
      const head = dom.window.document.head
      const csp = head.querySelector(
        'meta[http-equiv="Content-Security-Policy"]'
      )
      const boot = head.querySelector('script[src*="/host/boot.js"]')
      expect(csp?.getAttribute('content')).toBe("script-src 'none'")
      expect(boot).not.toBeNull()
      expect(html.indexOf('Content-Security-Policy')).toBeLessThan(
        html.indexOf('host/boot.js')
      )
      if (html.includes('theme-boot.js'))
        expect(html.indexOf('host/boot.js')).toBeLessThan(
          html.indexOf('theme-boot.js')
        )
      dom.window.close()
    }
  )

  it('inserts boot before an unterminated head title', async () => {
    write(
      path.join(root, 'client', 'dist', 'index.html'),
      '<!doctype html><html><head><title>Unclosed'
    )
    await buildMockSite(target())
    const html = fs.readFileSync(path.join(out(), 'index.html'), 'utf8')
    const dom = new JSDOM(html)
    expect(
      dom.window.document.head.querySelector('script[src*="/host/boot.js"]')
    ).not.toBeNull()
    expect(html.indexOf('host/boot.js')).toBeLessThan(html.indexOf('<title>'))
    dom.window.close()
  })

  it('rejects an unterminated comment when boot would become text', async () => {
    write(
      path.join(root, 'client', 'dist', 'index.html'),
      '<!doctype html><html><head><!-- Unclosed'
    )
    await expect(buildMockSite(target())).rejects.toThrow(/boot/i)
  })

  it('refuses a head policy after an app script instead of bypassing it', async () => {
    write(
      path.join(root, 'client', 'dist', 'index.html'),
      `<!doctype html><html><head><script src="theme-boot.js"></script><meta http-equiv="Content-Security-Policy" content="script-src 'none'"></head></html>`
    )
    await expect(buildMockSite(target())).rejects.toThrow(/CSP/i)
  })

  it('honors implicit-head CSP metadata before the host', async () => {
    write(
      path.join(root, 'client', 'dist', 'index.html'),
      `<!doctype html><html><meta http-equiv="Content-Security-Policy" content="script-src 'self'"><script src="theme-boot.js"></script><body></body></html>`
    )
    await buildMockSite(target())
    const html = fs.readFileSync(path.join(out(), 'index.html'), 'utf8')
    expect(html.indexOf('Content-Security-Policy')).toBeLessThan(
      html.indexOf('host/boot.js')
    )
    expect(html.indexOf('host/boot.js')).toBeLessThan(
      html.indexOf('theme-boot.js')
    )
  })

  it('boots before scripts after implicit head and body markup', async () => {
    write(
      path.join(root, 'client', 'dist', 'index.html'),
      `<!doctype html><html><meta http-equiv="Content-Security-Policy" content="script-src 'self'"><div>App</div><script src="theme-boot.js"></script></html>`
    )
    await buildMockSite(target())
    const html = fs.readFileSync(path.join(out(), 'index.html'), 'utf8')
    expect(html.indexOf('Content-Security-Policy')).toBeLessThan(
      html.indexOf('host/boot.js')
    )
    expect(html.indexOf('host/boot.js')).toBeLessThan(html.indexOf('<div>'))
  })

  it('preserves script tags in order when the source has no head', async () => {
    const scripts = [
      '<script type="application/ld+json">{"name":"app"}</script>',
      '<script defer id="sasjs-adapter" src="sasjs.js"></script>',
      '<script>window.__boot = {ready: false}</script>',
      '<script src="js/backend.js"></script>',
      '<script src="js/game.js" crossorigin="anonymous"></script>'
    ]
    write(
      path.join(root, 'client', 'dist', 'index.html'),
      `<!doctype html><html><body>${scripts.join('')}</body></html>`
    )
    await buildMockSite(target())
    const html = fs.readFileSync(path.join(out(), 'index.html'), 'utf8')
    const tags = html.match(/<script\b[^>]*>[\s\S]*?<\/script>/g) || []
    expect(tags[0]).toMatch(
      /^<script src="\/host\/boot\.js\?v=[0-9a-f]{10}"><\/script>$/
    )
    expect(tags.slice(1)).toEqual(scripts)
    expect(html).toMatch(
      /<head><script src="\/host\/boot\.js\?v=[0-9a-f]{10}"><\/script><\/head>/
    )
    expect(html).not.toContain('data-scripts')
  })

  it('ships a captured drive snapshot when the project has one', async () => {
    const snapshot = {
      files: {
        [`/sasjs/drive/files${appLoc}/services/public/getdata.js`]:
          'const a = 1\n',
        [`/sasjs/drive/files${appLoc}/data/DC_JSLIB/mpe_config.json`]:
          '{"rows":[]}'
      }
    }
    write(
      path.join(root, 'sasjsbuild', 'mock-snapshot.json'),
      JSON.stringify(snapshot)
    )

    const result = await buildMockSite(target())

    expect(result.snapshot).toBe(true)
    const index = readIndex()
    expect(index.sharded).toBe(true)
    expect(Object.keys(index.entries).length).toBe(2)
    // two small files under one folder: one boot shard, no request of their own
    expect(result.snapshotShards).toBe(1)
    expect(index.boot).toBe(0)
    expect(readShard(0)).toEqual(snapshot.files)
    // the runtime prefers a snapshot over the seed, so it must not be mistaken
    // for one of the seeded folders
    expect(readConfig().snapshot).toBe(true)
    expect(readConfig().snapshotShards).toBe(1)
  })

  /**
   * A captured drive is not one download.
   *
   * The first page of a demonstration site reads a listing and a handful of
   * logos; the bundles behind the tiles are opened by whoever clicks them. One
   * file for the lot makes every visitor pay for all of it before the page
   * renders, so the build splits it: small files in the boot shard, an app's
   * bundle in its own.
   */
  it('ships a large capture as a boot shard plus a piece per bundle', async () => {
    const bundle = 'x'.repeat(SHARD_FILE_BYTES + 1024)
    const capture = {
      files: {
        '/sasjs/drive/files/.sasjs/apps.json': '{"apps":[]}',
        [`/sasjs/drive/files/Public/app/demo/logo.png`]: 'not really a png',
        [`/sasjs/drive/files/Public/app/demo/services/web/index.bundle.js`]:
          bundle
      }
    }
    write(
      path.join(root, 'sasjsbuild', 'mock-snapshot.json'),
      JSON.stringify(capture)
    )

    const result = await buildMockSite(target())

    const index = readIndex()
    expect(result.snapshotShards).toBe(2)

    // what a first page reads is in the boot shard
    expect(index.entries['/sasjs/drive/files/.sasjs/apps.json'].shard).toBe(0)
    expect(
      index.entries[`/sasjs/drive/files/Public/app/demo/logo.png`].shard
    ).toBe(0)
    // the bundle is not: it is fetched when the app is opened
    const bundlePath = `/sasjs/drive/files/Public/app/demo/services/web/index.bundle.js`
    const bundleShard = index.entries[bundlePath].shard
    expect(bundleShard).not.toBe(0)
    expect(readShard(bundleShard)[bundlePath]).toBe(bundle)

    // the whole point: the boot shard is a fraction of the capture
    const bootBytes = index.shards[0].bytes
    const total = Object.keys(index.entries).reduce(
      (sum, key) => sum + index.entries[key].bytes,
      0
    )
    expect(bootBytes).toBeLessThan(total / 10)
  })

  it('refuses a capture written by a runtime of another format', async () => {
    write(
      path.join(root, 'sasjsbuild', 'mock-snapshot.json'),
      JSON.stringify({ format: DRIVE_FORMAT + 1, files: {} })
    )

    await expect(buildMockSite(target())).rejects.toThrow(/format/)
  })

  /**
   * The API console is generated, not written.
   *
   * It is the page that lets a visitor try the API a mock site is a mock of, so
   * it has to list the operations the package actually answers - and be
   * generated from the same route table the worker dispatches, or the page and
   * the host drift.
   */
  it('ships an API console built from the route table', async () => {
    const result = await buildMockSite(target())

    expect(result.apiConsole).toBe(true)
    const folder = path.join(out(), 'api-console')
    const shipped = fs.readdirSync(folder).sort()
    // every file the folder holds, and the worker's passthrough list is that same
    // list: a second copy in sw.js would let a new file be answered as an API path
    expect(shipped).toEqual([
      'console.css',
      'console.js',
      'index.html',
      'operations.json'
    ])
    // the console's folder is not an API prefix, so the worker needs no list of
    // its files: nothing under /api-console can be mistaken for an operation
    const sw = fs.readFileSync(path.join(out(), 'sw.js'), 'utf8')
    expect(sw).not.toContain('API_CONSOLE_FILES')

    const operations = JSON.parse(
      fs.readFileSync(path.join(folder, 'operations.json'), 'utf8')
    )
    expect(operations.length).toBeGreaterThan(20)
    const createUser = operations.find(
      (operation: any) => operation.id === 'POST /SASjsApi/user'
    )
    expect(createUser).toBeDefined()
    expect(createUser.params.map((parameter: any) => parameter.name)).toEqual(
      expect.arrayContaining(['username', 'password'])
    )
    expect(createUser.method).toBe('POST')

    // the page is static and carries no inline script: a project that serves it
    // under `default-src 'self'` would refuse one
    const html = fs.readFileSync(path.join(folder, 'index.html'), 'utf8')
    expect(html).toContain('<script src="console.js"></script>')
    expect(html).not.toMatch(/<script(?![^>]*\ssrc=)[^>]*>[\s\S]*?<\/script>/)
    // the page starts the host itself, so it registers the worker under the same
    // versioned URL the app's loader uses: two URLs for one scope replace each
    // other, which is an install nobody asked for on every visit to either page
    const version =
      /<meta name="sasjs-mock-version" content="([^"]+)" \/>/.exec(html)
    expect(version).not.toBeNull()
    // and it is the version the app's loader carries, so both pages register the
    // worker under one URL
    const appHtml = fs.readFileSync(path.join(out(), 'index.html'), 'utf8')
    const loader = /host\/boot\.js\?v=([^"']+)/.exec(appHtml)
    expect(loader).not.toBeNull()
    expect(version![1]).toBe(loader![1])
  })

  it('leaves the console out when the site ships its own console folder, and says so', async () => {
    const own = path.join(root, 'client', 'dist', 'api-console')
    fs.mkdirSync(own, { recursive: true })
    fs.writeFileSync(path.join(own, 'index.html'), '<p>ours</p>')

    const result = await buildMockSite(target())

    // the project's file is not replaced, and the loss is reported rather than
    // silent: the build has no way to know which of the two the site wants
    expect(result.apiConsole).toBe(false)
    expect(
      fs.readFileSync(path.join(out(), 'api-console', 'index.html'), 'utf8')
    ).toBe('<p>ours</p>')
    expect(fs.existsSync(path.join(out(), 'api-console', 'console.js'))).toBe(
      false
    )
    expect(process.logger!.warn).toHaveBeenCalledWith(
      expect.stringContaining('api-console/index.html')
    )
  })

  it('leaves the console out when the target asks for the app alone', async () => {
    const result = await buildMockSite(target({ mockApi: false }))

    expect(result.apiConsole).toBe(false)
    expect(fs.existsSync(path.join(out(), 'api-console'))).toBe(false)
  })

  it('ships a recorded SAS session when the project has one', async () => {
    // Without a recording a .sas run is refused; with one, the host answers the
    // program it names with that session. The file is data in the project, so
    // the build only has to carry it into the site.
    const recording = {
      [`/sasjs/drive/files${appLoc}/services/public/report.sas`]: {
        log: 'NOTE: Copyright (c) 2016 by SAS Institute Inc., Cary, NC, USA.',
        print: 'The SAS System',
        webout: '{"SYSSITE":"00000000"}'
      }
    }
    write(
      path.join(root, 'sasjsbuild', 'sas-transcript.json'),
      JSON.stringify(recording)
    )

    const result = await buildMockSite(target())

    expect(result.sasTranscript).toBe(true)
    expect(
      JSON.parse(
        fs.readFileSync(path.join(out(), 'host', 'sas-transcript.json'), 'utf8')
      )
    ).toEqual(recording)
    expect(readConfig().sasTranscript).toBe(true)
  })

  it('ships no recording when the project has none', async () => {
    const result = await buildMockSite(target())

    expect(result.sasTranscript).toBe(false)
    expect(fs.existsSync(path.join(out(), 'host', 'sas-transcript.json'))).toBe(
      false
    )
  })

  it('ships no snapshot when the project has none', async () => {
    const result = await buildMockSite(target())

    expect(result.snapshot).toBe(false)
    expect(fs.existsSync(path.join(out(), 'host', 'vfs-snapshot.json'))).toBe(
      false
    )
  })

  it('carries a non-text file onto the drive as bytes', async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    write(path.join(root, 'sasjsbuild', 'mock-storage', 'fixtures.json'), '{}')
    fs.writeFileSync(
      path.join(root, 'sasjsbuild', 'mock-storage', 'logo.png'),
      png
    )
    // text that begins with the marker's own NUL is escaped, so it cannot be
    // mistaken for a byte entry
    fs.writeFileSync(
      path.join(root, 'sasjsbuild', 'mock-storage', 'odd.txt'),
      '\u0000base64:not really'
    )

    const result = await buildMockSite(target())

    const seed = readSeed()
    // stored behind the marker the runtime decodes, and the text files beside it
    // stay text
    expect(
      seed.files[`/sasjs/drive/files${appLoc}/mock-storage/logo.png`]
    ).toBe('\u0000base64:' + png.toString('base64'))
    expect(
      seed.files[`/sasjs/drive/files${appLoc}/mock-storage/fixtures.json`]
    ).toBe('{}')
    expect(seed.files[`/sasjs/drive/files${appLoc}/mock-storage/odd.txt`]).toBe(
      '\u0000text:\u0000base64:not really'
    )
    expect(result.driveEntries).toBe(7) // 3 programs + 3 text files + the png
  })

  it('leaves a byte file over the seed bound off the drive, and names it', async () => {
    write(path.join(root, 'sasjsbuild', 'mock-storage', 'fixtures.json'), '{}')
    fs.writeFileSync(
      path.join(root, 'sasjsbuild', 'mock-storage', 'export.zip'),
      Buffer.alloc(MAX_BINARY_SEED_BYTES + 1, 0x89)
    )

    const result = await buildMockSite(target())

    const seed = readSeed()
    // one large artefact must not make the generated site unloadable
    expect(
      seed.files[`/sasjs/drive/files${appLoc}/mock-storage/export.zip`]
    ).toBeUndefined()
    expect(result.driveEntries).toBe(5) // 3 programs + 2 text files
    expect(process.logger?.warn).toHaveBeenCalledWith(
      expect.stringContaining('export.zip (10 MB')
    )
  })

  it('stops seeding bytes once the drive budget is spent, and names the file', async () => {
    write(path.join(root, 'sasjsbuild', 'mock-storage', 'fixtures.json'), '{}')
    // each file is under the per-file bound; together they pass the total
    const chunk = Buffer.alloc(Math.floor(MAX_BINARY_SEED_BYTES * 0.9), 0x89)
    for (const name of ['one.bin', 'two.bin', 'three.bin']) {
      fs.writeFileSync(
        path.join(root, 'sasjsbuild', 'mock-storage', name),
        chunk
      )
    }

    await buildMockSite(target())

    // the budget is spent in path order, so the drive is the same on every host:
    // one and three fit, two does not
    const seed = readSeed()
    const seeded = Object.keys(seed.files)
      .filter((key) => key.endsWith('.bin'))
      .map((key) => key.slice(key.lastIndexOf('/') + 1))
    expect(seeded).toEqual(['one.bin', 'three.bin'])
    expect(process.logger?.warn).toHaveBeenCalledWith(
      expect.stringContaining('two.bin (9 MB, over the drive budget)')
    )
  })

  it('seeds a project file the runtime reads back as its bytes', async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    write(path.join(root, 'sasjsbuild', 'mock-storage', 'fixtures.json'), '{}')
    fs.writeFileSync(
      path.join(root, 'sasjsbuild', 'mock-storage', 'logo.png'),
      png
    )

    await buildMockSite(target())

    // the seed is only useful if the runtime decodes what the build wrote
    ;(global as any).self = {}
    jest.resetModules()
    const runtime = require('../assets/runtime-core.js')
    runtime.load(readSeed().files)
    const served = runtime.run({
      code: [
        `const file = '/sasjs/drive/files${appLoc}/mock-storage/logo.png'`,
        "_webout = [fs.readFileSync(file).toString('hex'), fs.statSync(file).size].join('|')"
      ].join('\n')
    })
    delete (global as any).self

    expect(served.error).toBeNull()
    expect(served.webout).toBe(`${png.toString('hex')}|${png.length}`)
  })

  /**
   * A SAS backend does not run in a browser, but the programs are still worth
   * shipping: the drive holds them, so a visitor can open them in Studio and
   * read what a deployment's services do. The build warns and carries on.
   */
  it('builds a target whose services are SAS, and warns they cannot run', async () => {
    fs.rmSync(path.join(root, 'sasjsbuild', 'services'), {
      recursive: true,
      force: true
    })
    write(
      path.join(root, 'sasjsbuild', 'services', 'public', 'getdata.sas'),
      '%put sas;\n'
    )

    const warn = jest.spyOn(process.logger ?? console, 'warn')

    const result = await buildMockSite(target())

    expect(result.jsPrograms).toBe(0)
    expect(result.driveEntries).toBeGreaterThan(0)
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('cannot run in a browser')
    )

    // the program is on the drive, where Studio can open it
    const seed = readSeed()
    expect(
      Object.keys(seed.files).some((key) => key.endsWith('/getdata.sas'))
    ).toBe(true)

    warn.mockRestore()
  })

  /**
   * The case this build exists for: an interface with no services at all.
   * sasjs/server's own frontend compiles to nothing, and the worker answers its
   * API - so the target must build, ship the web app, and say out loud that the
   * drive it ships is empty.
   */
  it('builds an interface that has no services, and says the drive is empty', async () => {
    // nothing a drive could be seeded from: no services, no sync folder
    for (const folder of ['services', 'mock-storage']) {
      fs.rmSync(path.join(root, 'sasjsbuild', folder), {
        recursive: true,
        force: true
      })
    }

    const warn = jest.spyOn(process.logger ?? console, 'warn')

    const result = await buildMockSite(target())

    expect(result.jsPrograms).toBe(0)
    expect(result.driveEntries).toBe(0)
    expect(fs.existsSync(path.join(out(), 'index.html'))).toBe(true)
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('ships with an empty drive')
    )

    warn.mockRestore()
  })

  /**
   * A stale build folder is the case the warning exists for: `sasjs doc` and
   * other commands leave folders behind that are not program folders, so a count
   * of files on the drive says nothing about whether anything was compiled.
   */
  it('warns when the build folder holds only folders that are not programs', async () => {
    for (const folder of ['services', 'mock-storage']) {
      fs.rmSync(path.join(root, 'sasjsbuild', folder), {
        recursive: true,
        force: true
      })
    }

    write(path.join(root, 'sasjsbuild', 'docs', 'index.html'), '<html></html>')

    const warn = jest.spyOn(process.logger ?? console, 'warn')

    const result = await buildMockSite(target())

    // the drive is NOT empty - the docs folder reaches it - so the file count
    // alone would have kept quiet
    expect(result.driveEntries).toBeGreaterThan(0)
    expect(result.jsPrograms).toBe(0)
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('No compiled programs')
    )

    warn.mockRestore()
  })

  it('refuses to build without a web app', async () => {
    await expect(
      buildMockSite(target({ webSourcePath: './does-not-exist' }))
    ).rejects.toThrow(/Web source folder not found/)
  })

  it('refuses to build without an appLoc', async () => {
    await expect(buildMockSite({ streamConfig: {} } as any)).rejects.toThrow(
      /No appLoc/
    )
  })

  it('replaces an existing output folder rather than merging into it', async () => {
    write(path.join(out(), 'stale.txt'), 'old')

    await buildMockSite(target())

    expect(fs.existsSync(path.join(out(), 'stale.txt'))).toBe(false)
  })

  it('warns instead of failing when the index.html is not the expected shape', async () => {
    write(
      path.join(root, 'client', 'dist', 'index.html'),
      '<!doctype html><html><body><div id="app"></div></body></html>'
    )

    const result = await buildMockSite(target())

    expect(result.webFileCount).toBeGreaterThan(0)
    expect(process.logger?.warn).toHaveBeenCalledWith(
      expect.stringContaining('no <sasjs> element found')
    )
    expect(process.logger?.warn).toHaveBeenCalledWith(
      expect.stringContaining('no script tags found')
    )
  })

  it('puts a streamed build on the drive, where its page reads it from', async () => {
    write(
      path.join(root, 'sasjsbuild', 'services', 'web', 'index.html'),
      '<html></html>'
    )
    write(
      path.join(root, 'sasjsbuild', 'services', 'clickme.html'),
      `<html><script src="/SASJobExecution?_FILE=${appLoc}/services/web/index.html"></script></html>`
    )

    await buildMockSite(target({ streamWeb: true, streamWebFolder: 'web' }))

    const keys = Object.keys(readSeed().files)
    // the artefact a server would serve is the artefact this site serves: the
    // entry page and its assets are on the drive, read back through `_FILE=`
    expect(keys).toContain(
      `/sasjs/drive/files${appLoc}/services/web/index.html`
    )
    expect(keys).toContain(`/sasjs/drive/files${appLoc}/services/clickme.html`)

    // and the unmodified frontend is still what the site itself is
    expect(fs.existsSync(path.join(out(), 'index.html'))).toBe(true)
  })

  it('publishes the not-found page a deep link needs, on a streamed build or any other', async () => {
    write(
      path.join(root, 'sasjsbuild', 'services', 'web', 'index.html'),
      '<html></html>'
    )
    write(
      path.join(root, 'sasjsbuild', 'services', 'clickme.html'),
      `<html><script src="/StoredProgram?_FILE=${appLoc}/services/web/index.html"></script></html>`
    )

    await buildMockSite(target({ streamWeb: true, streamWebFolder: 'web' }))

    // a static host answers an unknown path with 404.html and a 404 status; the
    // entry page is on the drive, so without this page a first visit to it dies
    // on the host before any worker exists
    const fallbackPage = fs.readFileSync(path.join(out(), '404.html'), 'utf8')
    const fallbackScript = fs.readFileSync(path.join(out(), '404.js'), 'utf8')

    // the page carries the policy the rest of the site carries, and its script
    // is a file: an inline one would be the single exemption on the site
    expect(fallbackPage).toContain(`default-src 'self'`)
    expect(fallbackPage).toContain('src="/404.js"')
    expect(fallbackPage).not.toContain('<script>')

    // what the fallback has to do: install the site's worker, retry the same
    // address, and stop after a bounded number of attempts rather than loop
    expect(fallbackScript).toContain("register('/sw.js')")
    expect(fallbackScript).toContain('location.replace(target)')
    expect(fallbackScript).toMatch(/MAX_ATTEMPTS\s*=\s*\d+/)

    // nothing app-specific: this page is written for every project that builds
    // a mock site, so it cannot name one
    expect(fallbackPage).not.toContain('clickme')
    expect(fallbackScript).not.toContain(appLoc)
  })

  it("points the not-found page at the site's own folder when it is mounted under a base path", async () => {
    await buildMockSite(target({ mockWebBasePath: '/some/base' }))

    const fallbackPage = fs.readFileSync(path.join(out(), '404.html'), 'utf8')
    const fallbackScript = fs.readFileSync(path.join(out(), '404.js'), 'utf8')

    // a mounted site is served one folder down: the page's script and the
    // worker it installs are in that folder, not at the host's root
    expect(fallbackPage).toContain('src="/some/base/404.js"')
    expect(fallbackScript).toContain("register('/some/base/sw.js')")
  })

  it('publishes the not-found page when the target does not stream web at all', async () => {
    await buildMockSite(target())

    expect(fs.existsSync(path.join(out(), '404.html'))).toBe(true)
    expect(fs.existsSync(path.join(out(), '404.js'))).toBe(true)
  })

  it('refuses a mockWebFolder outside the project', async () => {
    const outside = fs.mkdtempSync(
      path.join(require('os').tmpdir(), 'outside-')
    )

    await expect(
      buildMockSite(target({ mockWebFolder: outside }))
    ).rejects.toThrow(/outside the project/)

    expect(fs.existsSync(outside)).toBe(true)
    fs.rmSync(outside, { recursive: true, force: true })
  })

  it('refuses a mockWebFolder that would delete the project or its inputs', async () => {
    for (const mockWebFolder of [
      '.',
      './',
      '..',
      'sasjsbuild',
      'client/dist',
      'client/dist/mock'
    ]) {
      await expect(buildMockSite(target({ mockWebFolder }))).rejects.toThrow(
        /Refusing to write the mock site/
      )
      // nothing was removed on the way to the refusal
      expect(
        fs.existsSync(path.join(root, 'client', 'dist', 'index.html'))
      ).toBe(true)
      expect(
        fs.existsSync(path.join(root, 'sasjsbuild', 'services', 'public'))
      ).toBe(true)
    }
    expect(fs.existsSync(path.join(root, 'client', 'dist', 'index.html'))).toBe(
      true
    )
  })

  /**
   * The fixture the site signs in with: one file, and which fixture wins is
   * decided at build time. A project replaces it the same way it replaces the
   * drive seed, so a site ships the identity its author chose rather than one
   * the runtime happens to hold.
   */
  it('ships the packaged identity fixture when the project has none', async () => {
    const result = await buildMockSite(target())

    expect(result.identitySource).toBe('default')
    expect(readConfig().identity).toBe('default')

    const shipped = JSON.parse(
      fs.readFileSync(path.join(out(), 'host', 'identity.json'), 'utf8')
    )
    expect(shipped.format).toBe(1)
    expect(shipped.users.map((user: any) => user.username)).toEqual([
      'sasjsadmin',
      'sasjsuser'
    ])
    // the same fixture the package ships, so a mock signs in with no config
    expect(shipped.clients.map((client: any) => client.clientId)).toEqual([
      'web_app',
      'sasjs'
    ])
  })

  it("ships the project's mock-identity.json instead of the packaged fixture", async () => {
    const fixture = {
      format: 1,
      users: [
        {
          uid: 'user-auditor',
          username: 'auditor',
          displayName: 'Auditor',
          password: 'Orion123',
          isAdmin: true,
          isActive: true,
          needsToUpdatePassword: false
        }
      ],
      groups: [],
      permissions: [],
      clients: [
        {
          clientId: 'audit_app',
          clientSecret: 'audit_app',
          accessTokenExpiration: 3600,
          refreshTokenExpiration: 86400
        }
      ]
    }
    write(
      path.join(root, 'sasjsbuild', 'mock-identity.json'),
      JSON.stringify(fixture)
    )

    const result = await buildMockSite(target())

    expect(result.identitySource).toBe('mock-identity.json')
    expect(readConfig().identity).toBe('mock-identity.json')
    expect(
      JSON.parse(
        fs.readFileSync(path.join(out(), 'host', 'identity.json'), 'utf8')
      )
    ).toEqual(fixture)
  })

  it('stamps the build with the fixture, so an identity-only change re-seeds it', async () => {
    // the stamp decides whether a visitor keeps the drive and identity row they
    // already have; `host/identity.json` is only read when there is no row, so a
    // project that edits only mock-identity.json has to move it
    await buildMockSite(target())
    const before = readConfig().buildStamp

    await buildMockSite(target())
    expect(readConfig().buildStamp).toBe(before)

    const fixture = {
      format: 1,
      users: [
        {
          uid: 'user-auditor',
          username: 'auditor',
          displayName: 'Auditor',
          password: 'Orion123',
          isAdmin: true,
          isActive: true,
          needsToUpdatePassword: false
        }
      ],
      groups: [],
      permissions: [],
      clients: [
        {
          clientId: 'audit_app',
          clientSecret: 'audit_app',
          accessTokenExpiration: 3600,
          refreshTokenExpiration: 86400
        }
      ]
    }
    write(
      path.join(root, 'sasjsbuild', 'mock-identity.json'),
      JSON.stringify(fixture)
    )

    await buildMockSite(target())
    expect(readConfig().buildStamp).not.toBe(before)
  })

  it('refuses a mock-identity.json it cannot read, leaving the previous site in place', async () => {
    await buildMockSite(target())
    const before = fs.readFileSync(
      path.join(out(), 'host', 'identity.json'),
      'utf8'
    )

    write(path.join(root, 'sasjsbuild', 'mock-identity.json'), '{ not json')

    await expect(buildMockSite(target())).rejects.toThrow(
      /mock-identity\.json is not valid JSON/
    )
    expect(
      fs.readFileSync(path.join(out(), 'host', 'identity.json'), 'utf8')
    ).toBe(before)

    // a fixture this build cannot read is refused by name, with the reason
    const wrongFormat = {
      format: 0,
      users: [],
      groups: [],
      permissions: [],
      clients: []
    }
    write(
      path.join(root, 'sasjsbuild', 'mock-identity.json'),
      JSON.stringify(wrongFormat)
    )

    await expect(buildMockSite(target())).rejects.toThrow(
      /mock-identity\.json cannot be used: The identity fixture states format 0/
    )
  })
})
