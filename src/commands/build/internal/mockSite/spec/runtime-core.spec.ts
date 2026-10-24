export {}

/**
 * The parity claim of a browser-hosted build is that a service runs in the
 * browser exactly as it runs as a stored program. That claim lives in
 * runtime-core.js (parameter emission, WEBIN refs, program resolution, webout
 * precedence, the error shape), so it is tested directly against the file the
 * site ships.
 */
const appLoc = '/Public/app/test'

const drivePath = (relative: string) =>
  `/sasjs/drive/files${appLoc}/${relative}`

const loadRuntime = () => {
  ;(global as any).self = {}
  jest.resetModules()
  return require('../assets/runtime-core.js')
}

const jsonResponse = (body: any) => ({
  ok: true,
  json: async () => body
})

const seedDrive = async (runtime: any, files: { [path: string]: string }) => {
  ;(global as any).fetch = jest.fn(async (url: string) => {
    if (url.includes('mock-config')) return jsonResponse({ appLoc })
    if (url.includes('vfs-seed')) return jsonResponse({ files })
    return { ok: false, json: async () => ({}) }
  })
  await runtime.seed()
}

describe('browser runtime', () => {
  afterEach(() => {
    delete (global as any).self
    delete (global as any).fetch
  })

  it('exposes request parameters as variables, with JSON escaping', () => {
    const runtime = loadRuntime()

    const result = runtime.run({
      code: '_webout = typeof said + "|" + said + "|" + count;',
      params: { said: 'he said "hi"\nback\\slash', count: '7' }
    })

    expect(result.error).toBeNull()
    expect(result.webout).toBe('string|he said "hi"\nback\\slash|7')
  })

  it('leaves a parameter name that is not an identifier out of the prelude', () => {
    const runtime = loadRuntime()

    // an emitted `const not-an-identifier` would be a syntax error for every
    // service on the drive, so such names are filtered out
    const result = runtime.run({
      code: '_webout = "ran";',
      params: { 'not-an-identifier': 'x', '1leading': 'y' }
    })

    expect(result.error).toBeNull()
    expect(result.webout).toBe('ran')
  })

  it('exposes uploaded tables as WEBIN refs', () => {
    const runtime = loadRuntime()

    const result = runtime.run({
      code: '_webout = [_WEBIN_FILE_COUNT, _WEBIN_NAME1, _WEBIN_FILENAME1, _WEBIN_FILEREF1].join(",");',
      tables: [{ name: 'table1', filename: 'data.csv', csv: 'a,b\n1,2\n' }]
    })

    expect(result.error).toBeNull()
    expect(result.webout).toBe('1,table1,data.csv,a,b\n1,2\n')
    // the fileref carries the CSV verbatim, as the fileref does on the server
    expect(result.webout).toContain('a,b\n1,2')
  })

  it('reads a webout the service wrote to the fileref directly', () => {
    const runtime = loadRuntime()

    const result = runtime.run({
      code: "require('fs').writeFileSync(weboutPath, 'from-file');"
    })

    expect(result.webout).toBe('from-file')
  })

  it('writes an assigned webout to the fileref, as the generated program does', () => {
    const runtime = loadRuntime()

    const result = runtime.run({ code: "_webout = 'inline';" })

    expect(result.webout).toBe('inline')
  })

  it('reports a thrown error without failing the run', () => {
    const runtime = loadRuntime()

    const result = runtime.run({ code: 'throw new Error("boom")' })

    expect(result.error).toContain('boom')
    expect(result.log).toContain('boom')
    expect(result.webout).toBe('')
  })

  it('collects service console output into the log', () => {
    const runtime = loadRuntime()

    const result = runtime.run({
      code: 'console.log("hello", { a: 1 }); _webout = "ok";'
    })

    expect(result.log).toContain('hello {"a":1}')
    expect(result.webout).toBe('ok')
  })

  it('resolves the full path the adapter sends', async () => {
    const runtime = loadRuntime()
    await seedDrive(runtime, {
      [drivePath('services/public/getdata.js')]: '_webout = "full";'
    })

    const result = runtime.run({ program: `${appLoc}/services/public/getdata` })

    expect(result.error).toBeNull()
    expect(result.webout).toBe('full')
  })

  it('resolves an appLoc-relative reference under services, jobs or tests', async () => {
    const runtime = loadRuntime()
    await seedDrive(runtime, {
      [drivePath('services/public/getdata.js')]: '_webout = "apploc-relative";',
      [drivePath('jobs/public/loaddata.js')]: '_webout = "job";'
    })

    // the adapter prepends the appLoc when the app passes no leading slash
    expect(runtime.run({ program: `${appLoc}/public/getdata` }).webout).toBe(
      'apploc-relative'
    )
    expect(runtime.run({ program: 'public/loaddata' }).webout).toBe('job')
  })

  it('fails a run that names a program the drive does not hold', () => {
    const runtime = loadRuntime()

    expect(() => runtime.run({ program: 'services/public/missing' })).toThrow(
      /Program not found in drive/
    )
  })
})
