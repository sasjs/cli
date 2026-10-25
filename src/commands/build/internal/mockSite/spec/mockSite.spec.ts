import fs from 'fs'
import path from 'path'
import { buildMockSite } from '../mockSite'

const appLoc = '/Public/app/test'

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
      '<!doctype html><html><head><title>App</title></head><body>',
      `<sasjs serverurl="https://sas.example.com" apploc="${appLoc}" servertype="SASJS" loginmechanism="Redirected"></sasjs>`,
      '<script src="main.abc123.js" type="module"></script>',
      '</body></html>'
    ].join('\n')
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

  it('writes the runtime host and the worker at the site root', async () => {
    await buildMockSite(target())

    for (const asset of [
      'md5.js',
      'runtime-core.js',
      'persist.js',
      'intercept.js'
    ]) {
      expect(fs.existsSync(path.join(out(), 'host', asset))).toBe(true)
    }
    // a worker only controls the folder it is served from, so it has to sit at
    // the root rather than under host/
    expect(fs.existsSync(path.join(out(), 'sw.js'))).toBe(true)
    expect(fs.existsSync(path.join(out(), 'host', 'sw.js'))).toBe(false)
    expect(readConfig().appLoc).toBe(appLoc)
  })

  it('points the app at itself and installs the boot loader', async () => {
    await buildMockSite(target())

    const html = fs.readFileSync(path.join(out(), 'index.html'), 'utf8')
    expect(html).toContain('serverurl=""')
    expect(html).toContain('loginmechanism="Default"')
    expect(html).not.toContain('https://sas.example.com')
    expect(html).toContain("register('/sw.js'")
    expect(html).toContain('host/persist.js')
    expect(html).toContain('main.abc123.js')
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
    const shipped = JSON.parse(
      fs.readFileSync(path.join(out(), 'host', 'vfs-snapshot.json'), 'utf8')
    )
    expect(Object.keys(shipped.files).length).toBe(2)
    // the runtime prefers a snapshot over the seed, so it must not be mistaken
    // for one of the seeded folders
    expect(readConfig().snapshot).toBe(true)
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

  it('refuses a target whose services are SAS, and keeps the previous site', async () => {
    await buildMockSite(target())
    write(path.join(out(), 'stale.txt'), 'previous')

    fs.rmSync(path.join(root, 'sasjsbuild', 'services'), {
      recursive: true,
      force: true
    })
    write(
      path.join(root, 'sasjsbuild', 'services', 'public', 'getdata.sas'),
      '%put sas;\n'
    )

    await expect(buildMockSite(target())).rejects.toThrow(/No \.js programs/)
    // the failure is not allowed to take the last good site with it
    expect(fs.readFileSync(path.join(out(), 'stale.txt'), 'utf8')).toBe(
      'previous'
    )
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
      expect.stringContaining('no main bundle script tag found')
    )
  })

  it('leaves a streamed web folder off the drive', async () => {
    write(
      path.join(root, 'sasjsbuild', 'services', 'web', 'index.html'),
      '<html></html>'
    )

    await buildMockSite(target({ streamWeb: true, streamWebFolder: 'web' }))

    const keys = Object.keys(readSeed().files)
    expect(keys.some((k) => k.startsWith(`${appLoc}/services/web/`))).toBe(
      false
    )
    // the same folder is still the site's own content, so it is copied
    expect(fs.existsSync(path.join(out(), 'index.html'))).toBe(true)
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
})
