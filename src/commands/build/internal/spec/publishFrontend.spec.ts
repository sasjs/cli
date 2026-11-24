import fs from 'fs'
import os from 'os'
import path from 'path'
import { Target } from '@sasjs/utils'

import { publishFrontend } from '../publishFrontend'

const target = (over: Partial<Target> = {}): Target =>
  ({
    name: 'demo',
    appLoc: '/Public/apps/demo',
    serverType: 'SASJS',
    ...over
  }) as unknown as Target

const streamConfig = (over: { [key: string]: any } = {}) =>
  ({
    streamWeb: true,
    streamWebFolder: 'web',
    webSourcePath: 'client/dist',
    streamServiceName: 'demo',
    assetPaths: [],
    ...over
  }) as any

describe('the frontend published to a SASjs server app', () => {
  let root: string
  let destination: string

  const write = (relative: string, content: string) => {
    const file = path.join(root, relative)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, content)
  }

  const read = (relative: string) =>
    fs.readFileSync(path.join(destination, relative), 'utf8')

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'sasjs-publish-'))
    process.projectDir = root
    destination = path.join(root, 'sasjsbuild', 'publish')
  })

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true })
    process.projectDir = ''
  })

  it('copies the compiled frontend, not a synthesised page', () => {
    write('client/dist/index.html', '<html><body>real app</body></html>')
    write('client/dist/assets/main.abc123.js', 'console.log(1)')

    return publishFrontend(target(), streamConfig(), destination).then(() => {
      expect(read('index.html')).toContain('real app')
      expect(read('assets/main.abc123.js')).toEqual('console.log(1)')
    })
  })

  it('makes root-absolute asset references resolve inside the app', async () => {
    write(
      'client/dist/index.html',
      '<html><head><base href="/">' +
        '<link rel="stylesheet" href="/assets/style.css">' +
        '<script src="/assets/main.js"></script></head><body></body></html>'
    )
    write('client/dist/assets/main.js', 'console.log(1)')

    await publishFrontend(target(), streamConfig(), destination)

    const html = read('index.html')
    expect(html).toContain('href="./assets/style.css"')
    expect(html).toContain('src="./assets/main.js"')
    expect(html).toContain('<base href="./">')
  })

  it('leaves a relative reference and a protocol-relative one alone', async () => {
    write(
      'client/dist/index.html',
      '<html><head>' +
        '<script src="./assets/main.js"></script>' +
        '<script src="//cdn.example/lib.js"></script>' +
        '</head><body></body></html>'
    )

    await publishFrontend(target(), streamConfig(), destination)

    const html = read('index.html')
    expect(html).toContain('src="./assets/main.js"')
    expect(html).toContain('src="//cdn.example/lib.js"')
  })

  it('rewrites an absolute srcset candidate beside a data URI', async () => {
    const dataUri = 'data:image/svg+xml;base64,PHN2Zy8+'

    write(
      'client/dist/index.html',
      '<html><head></head><body>' +
        `<img id="a" srcset="/img/a.png 1x, ${dataUri} 2x">` +
        `<img id="b" srcset="${dataUri} 1x, /img/b.png 2x">` +
        '</body></html>'
    )

    await publishFrontend(target(), streamConfig(), destination)

    const html = read('index.html')
    expect(html).toContain('./img/a.png 1x')
    expect(html).toContain('./img/b.png 2x')
    // the data URI is untouched, commas and all
    expect(html).toContain(`${dataUri} 2x`)
    expect(html).toContain(`${dataUri} 1x`)
  })

  it('leaves a navigation link alone', async () => {
    // an anchor is not an asset: its href may name the server's API or another
    // site, and relativising it would point it inside the app
    write(
      'client/dist/index.html',
      '<html><head></head><body><a href="/docs">docs</a></body></html>'
    )

    await publishFrontend(target(), streamConfig(), destination)

    expect(read('index.html')).toContain('href="/docs"')
  })

  it('makes root-absolute CSS urls relative, in a file, inline and in a style attribute', async () => {
    write(
      'client/dist/index.html',
      '<html><head>' +
        '<style>@font-face{src:url(/assets/f.woff2)}</style>' +
        '</head><body><div style="background-image:url(\'/assets/bg.png\')"></div></body></html>'
    )
    write(
      'client/dist/assets/style.css',
      '@import "/assets/reset.css";' +
        '.a{background:url(/assets/bg.png)}' +
        '.d{background:url(/assets/f.woff2)}' +
        '.b{background:url("//cdn.example/x.png")}' +
        '.c{background:url(data:image/png;base64,AAAA)}'
    )

    await publishFrontend(target(), streamConfig(), destination)

    // inline CSS has the document as its base
    expect(read('index.html')).toContain('url(./assets/f.woff2)')
    expect(read('index.html')).toContain("url('./assets/bg.png')")
    // a stylesheet in assets/ resolves against assets/, not the document
    const css = read('assets/style.css')
    expect(css).toContain('@import "./reset.css"')
    expect(css).toContain('url(./bg.png)')
    expect(css).toContain('url(./f.woff2)')
    // another site, and a self-contained URI, are not the app's own files
    expect(css).toContain('url("//cdn.example/x.png")')
    expect(css).toContain('url(data:image/png;base64,AAAA)')
  })

  it('treats CSS function and at-rule names as case-insensitive', async () => {
    write(
      'client/dist/index.html',
      '<html><head><style>.a{background:URL(/assets/bg.png)}</style>' +
        '</head><body></body></html>'
    )
    write(
      'client/dist/assets/style.css',
      '@IMPORT "/assets/reset.css";.b{background:URL(/assets/bg.png)}'
    )

    await publishFrontend(target(), streamConfig(), destination)

    // the rewrite lower-cases the function/at-rule name, which CSS allows
    expect(read('index.html')).toContain('url(./assets/bg.png)')
    const css = read('assets/style.css')
    expect(css).toContain('@import "./reset.css"')
    expect(css).toContain('url(./bg.png)')
  })

  it('rewrites the xlink:href form an SVG sprite uses', async () => {
    write(
      'client/dist/index.html',
      '<html><head></head><body><svg><use xlink:href="/assets/icons.svg#x"></use></svg></body></html>'
    )

    await publishFrontend(target(), streamConfig(), destination)

    expect(read('index.html')).toContain('xlink:href="./assets/icons.svg#x"')
  })

  it('resolves a stylesheet reference in a sibling folder with ..', async () => {
    write('client/dist/index.html', '<html><head></head><body></body></html>')
    write(
      'client/dist/css/deep/style.css',
      '.a{background:url(/assets/bg.png)}'
    )

    await publishFrontend(target(), streamConfig(), destination)

    expect(read('css/deep/style.css')).toContain('url(../../assets/bg.png)')
  })

  it('handles a bare comma between srcset candidates', async () => {
    const dataUri = 'data:image/svg+xml;base64,PHN2Zy8+'

    write(
      'client/dist/index.html',
      '<html><head></head><body>' +
        `<img id="a" srcset="/img/a.png 1x,${dataUri} 2x,/img/c.png 3x">` +
        '</body></html>'
    )

    await publishFrontend(target(), streamConfig(), destination)

    const html = read('index.html')
    expect(html).toContain('./img/a.png 1x')
    expect(html).toContain('./img/c.png 3x')
    expect(html).toContain(`${dataUri} 2x`)
  })

  it('resumes after a descriptor-less data URI', async () => {
    // the comma after a data URI with no descriptor is a separator, and looks
    // exactly like the payload's own comma to a naive scan
    write(
      'client/dist/index.html',
      '<html><head></head><body>' +
        '<img id="a" srcset="data:image/png;base64,AAAA, /img/a.png 2x">' +
        '</body></html>'
    )

    await publishFrontend(target(), streamConfig(), destination)

    const html = read('index.html')
    expect(html).toContain('data:image/png;base64,AAAA, ./img/a.png 2x')
  })

  it('points the bundler runtime at the app folder', async () => {
    write('client/dist/index.html', '<html><body></body></html>')
    write('client/dist/runtime.js', 'var t={};t.u=e=>e+".js";t.p="/";')

    await publishFrontend(target(), streamConfig(), destination)

    // a chunk is fetched from the folder the page came from, not the server root
    expect(read('runtime.js')).toContain('t.p="./"')
  })

  it('names the target appLoc and server type in the adapter config', async () => {
    write(
      'client/dist/index.html',
      '<html><head><sasjs appLoc="/built/against" serverType="SASVIYA"></sasjs></head><body></body></html>'
    )

    await publishFrontend(target(), streamConfig(), destination)

    const html = read('index.html')
    // jsdom serialises attribute names lowercased, which is what a browser reads
    expect(html.toLowerCase()).toContain('apploc="/public/apps/demo"')
    expect(html.toLowerCase()).toContain('servertype="sasjs"')
  })

  it('injects no mock host and no service worker', async () => {
    write('client/dist/index.html', '<html><head></head><body></body></html>')

    await publishFrontend(target(), streamConfig(), destination)

    expect(fs.existsSync(path.join(destination, 'sw.js'))).toBe(false)
    expect(fs.existsSync(path.join(destination, 'host'))).toBe(false)
    expect(read('index.html')).not.toContain('sasjs-mock')
  })

  it('replaces a previous copy rather than merging into it', async () => {
    write('client/dist/index.html', '<html><body>current</body></html>')
    fs.mkdirSync(destination, { recursive: true })
    fs.writeFileSync(path.join(destination, 'index.html'), 'stale')

    await publishFrontend(target(), streamConfig(), destination)

    expect(read('index.html')).toContain('current')
  })

  it('refuses a source with no index.html, naming the folder', async () => {
    write('client/dist/main.js', 'console.log(1)')

    await expect(
      publishFrontend(target(), streamConfig(), destination)
    ).rejects.toThrow(/No index\.html at streamConfig\.webSourcePath/)
  })

  it('refuses a target with no webSourcePath', async () => {
    await expect(
      publishFrontend(
        target(),
        streamConfig({ webSourcePath: '' }),
        destination
      )
    ).rejects.toThrow(/No built web app/)
  })
})
