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

describe('sasjs mock', () => {
  let root: string
  const out = () => path.join(root, 'sasjsbuild', 'mock')
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
    process.currentDir = root
    ;(process as any).sasjsConfig = { syncFolder: 'sasjs' }
    process.sasjsConstants = {
      buildDestinationFolder: path.join(root, 'sasjsbuild')
    } as any
  })

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true })
  })

  it('lays the compile output out on the virtual drive', async () => {
    const result = await buildMockSite({ appLoc } as any, {
      webSourcePath: './client/dist'
    })

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
    await buildMockSite({ appLoc } as any, { webSourcePath: './client/dist' })

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
    await buildMockSite({ appLoc } as any, { webSourcePath: './client/dist' })

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

    const result = await buildMockSite({ appLoc } as any, {
      webSourcePath: './client/dist'
    })

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
    const result = await buildMockSite({ appLoc } as any, {
      webSourcePath: './client/dist'
    })

    expect(result.snapshot).toBe(false)
    expect(fs.existsSync(path.join(out(), 'host', 'vfs-snapshot.json'))).toBe(
      false
    )
  })

  it('refuses a target whose services are SAS', async () => {
    fs.rmSync(path.join(root, 'sasjsbuild', 'services'), {
      recursive: true,
      force: true
    })
    write(
      path.join(root, 'sasjsbuild', 'services', 'public', 'getdata.sas'),
      '%put sas;\n'
    )

    await expect(
      buildMockSite({ appLoc } as any, { webSourcePath: './client/dist' })
    ).rejects.toThrow(/No \.js programs/)
  })

  it('refuses to build without a web app', async () => {
    await expect(
      buildMockSite({ appLoc } as any, { webSourcePath: './does-not-exist' })
    ).rejects.toThrow(/Web source folder not found/)
  })

  it('refuses to build without an appLoc', async () => {
    await expect(
      buildMockSite({} as any, { webSourcePath: './client/dist' })
    ).rejects.toThrow(/No appLoc/)
  })

  it('replaces an existing output folder rather than merging into it', async () => {
    write(path.join(out(), 'stale.txt'), 'old')

    await buildMockSite({ appLoc } as any, { webSourcePath: './client/dist' })

    expect(fs.existsSync(path.join(out(), 'stale.txt'))).toBe(false)
  })
})
