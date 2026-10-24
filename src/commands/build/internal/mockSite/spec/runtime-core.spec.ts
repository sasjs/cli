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

  it('gives a service the virtual drive to work on', () => {
    const runtime = loadRuntime()
    const folder = `/sasjs/drive/files${appLoc}/data`

    const result = runtime.run({
      code: [
        `fs.mkdirSync('${folder}');`,
        `fs.writeFileSync('${folder}/a.txt', 'hello');`,
        `fs.copyFileSync('${folder}/a.txt', '${folder}/b.txt');`,
        `const seen = [fs.existsSync('${folder}/a.txt'), fs.readFileSync('${folder}/b.txt'), fs.statSync('${folder}/a.txt').size, fs.readdirSync('${folder}').join()];`,
        `fs.unlinkSync('${folder}/b.txt');`,
        `_webout = seen.join('|') + '|' + fs.existsSync('${folder}/b.txt');`
      ].join('\n')
    })

    expect(result.error).toBeNull()
    expect(result.webout).toBe('true|hello|5|a.txt,b.txt|false')
  })

  it('reports a missing drive file the way the server does', () => {
    const runtime = loadRuntime()

    const result = runtime.run({
      code: `_webout = String(require('fs').readFileSync('/no/such/file'))`
    })

    expect(result.error).toContain('ENOENT')
  })

  it('hands the headers a service writes back to the host', () => {
    const runtime = loadRuntime()

    const result = runtime.run({
      code: "require('fs').writeFileSync(_SASJS_WEBOUT_HEADERS, 'content-type: application/json');"
    })

    expect(result.headers).toBe('content-type: application/json')
  })

  it('hands a byte body back to the host as base64', () => {
    const runtime = loadRuntime()

    // the shape a service that streams a file uses on the server: write the
    // body to the fileref, and say in the headers what it is
    const result = runtime.run({
      code: [
        "fs.writeFileSync(_SASJS_WEBOUT_HEADERS, 'Content-type: application/zip')",
        'fs.writeFileSync(weboutPath, Uint8Array.from([80, 75, 3, 4]))'
      ].join('\n')
    })

    expect(result.error).toBeNull()
    expect(result.binary).toBe(true)
    expect(result.webout).toBe('UEsDBA==')
    expect(result.headers).toContain('application/zip')
  })

  it('accepts a Buffer, as a program written for the server uses', () => {
    const runtime = loadRuntime()

    expect(
      runtime.run({
        code: 'fs.writeFileSync(weboutPath, Buffer.from([80, 75, 3, 4]))'
      }).webout
    ).toBe('UEsDBA==')

    expect(
      runtime.run({
        code: "fs.writeFileSync(weboutPath, Buffer.from('UEsDBA==', 'base64'))"
      }).webout
    ).toBe('UEsDBA==')
  })

  it('decodes a Buffer from a binary string, from hex and from text', () => {
    const runtime = loadRuntime()

    expect(
      runtime.run({
        code: "fs.writeFileSync(weboutPath, Buffer.from('PK\\u0003\\u0004', 'binary'))"
      }).webout
    ).toBe('UEsDBA==')

    expect(
      runtime.run({
        code: "fs.writeFileSync(weboutPath, Buffer.from('504b0304', 'hex'))"
      }).webout
    ).toBe('UEsDBA==')

    // no encoding given means utf8, as in node
    expect(
      runtime.run({ code: "fs.writeFileSync(weboutPath, Buffer.from('ab'))" })
        .webout
    ).toBe('YWI=')
  })

  it('decodes a chunk of a Buffer, as a service streaming a file does', () => {
    const runtime = loadRuntime()

    const result = runtime.run({
      code: [
        "const file = '/sasjs/drive/files/pack.bin'",
        'fs.writeFileSync(file, Uint8Array.from([80, 75, 3, 4]))',
        'const read = fs.readFileSync(file)',
        'const chunk = read.subarray(0, 2)',
        "_webout = [chunk.toString('base64'), read.slice(0, 2).toString('base64'), read.subarray(2).toString('hex'), Buffer.from([1, 2, 3]).subarray(1).toString('hex'), Buffer.isBuffer(chunk)].join('|')"
      ].join('\n')
    })

    expect(result.error).toBeNull()
    expect(result.webout).toBe('UEs=|UEs=|0304|0203|true')
  })

  it('measures a Buffer or a string, and refuses what it cannot encode', () => {
    const runtime = loadRuntime()

    expect(
      runtime.run({
        code: "_webout = [Buffer.isBuffer('no'), Buffer.byteLength('ab'), Buffer.byteLength(Buffer.from([1, 2])), Buffer.allocUnsafe(3).length, Buffer.from([65]).toString()].join('|')"
      }).webout
    ).toBe('false|2|2|3|A')

    const refused = runtime.run({ code: 'Buffer.from({})' })
    expect(refused.error).toContain('unsupported input')
  })

  it('offers the Buffer helpers a service uses to build a body', () => {
    const runtime = loadRuntime()

    const result = runtime.run({
      code: [
        "const joined = Buffer.concat([Buffer.from([80, 75]), Buffer.from('0304', 'hex')])",
        "_webout = [Buffer.isBuffer(joined), Buffer.byteLength(joined), joined.toString('base64'), Buffer.alloc(2).length, joined.toString('latin1').charCodeAt(2)].join('|')"
      ].join('\n')
    })

    expect(result.error).toBeNull()
    expect(result.webout).toBe('true|4|UEsDBA==|2|3')
  })

  it('lets an assigned webout replace a byte body, as the generated program does', () => {
    const runtime = loadRuntime()

    const result = runtime.run({
      code: [
        'fs.writeFileSync(weboutPath, Uint8Array.from([80, 75, 3, 4]))',
        "_webout = 'text wins'"
      ].join('\n')
    })

    expect(result.binary).toBe(false)
    expect(result.webout).toBe('text wins')
  })

  it('reads a file written as bytes back as bytes', () => {
    const runtime = loadRuntime()

    const result = runtime.run({
      code: [
        "const file = '/sasjs/drive/files/data.bin'",
        'fs.writeFileSync(file, Uint8Array.from([1, 2, 3]))',
        'const read = fs.readFileSync(file)',
        "_webout = [read.length, read.toString('base64'), fs.statSync(file).size].join('|')"
      ].join('\n')
    })

    expect(result.error).toBeNull()
    expect(result.webout).toBe('3|AQID|3')
  })

  it('takes an ArrayBuffer or a view over one as bytes', () => {
    const runtime = loadRuntime()

    expect(
      runtime.run({
        code: 'fs.writeFileSync(weboutPath, new Uint8Array([80, 75, 3, 4]).buffer)'
      }).webout
    ).toBe('UEsDBA==')

    expect(
      runtime.run({
        code: 'fs.writeFileSync(weboutPath, new DataView(new Uint8Array([80, 75, 3, 4]).buffer))'
      }).webout
    ).toBe('UEsDBA==')

    // and a service can read one back as hex
    expect(
      runtime.run({
        code: 'fs.writeFileSync(weboutPath, Uint8Array.from([80, 75, 3, 4]))'
      }).binary
    ).toBe(true)
    expect(
      runtime.run({
        code: [
          "const file = '/sasjs/drive/files/a.bin'",
          'fs.writeFileSync(file, Uint8Array.from([80, 75, 3, 4]))',
          "_webout = fs.readFileSync(file).toString('hex')"
        ].join('\n')
      }).webout
    ).toBe('504b0304')
  })

  it('reports a directory and a missing file the way node does', () => {
    const runtime = loadRuntime()

    const result = runtime.run({
      code: [
        "fs.mkdirSync('/sasjs/drive/files/folder')",
        "const isDir = fs.statSync('/sasjs/drive/files/folder').isDirectory()",
        'let copyError = "none"',
        "try { fs.copyFileSync('/sasjs/drive/files/none.bin', '/sasjs/drive/files/there.bin') } catch (e) { copyError = e.message }",
        'let statError = "none"',
        "try { fs.statSync('/sasjs/drive/files/none.bin') } catch (e) { statError = e.code }",
        "_webout = [isDir, copyError.includes('ENOENT'), statError].join('|')"
      ].join('\n')
    })

    expect(result.error).toBeNull()
    expect(result.webout).toBe('true|true|ENOENT')
  })

  it('logs a value it cannot serialise rather than failing the run', () => {
    const runtime = loadRuntime()

    const result = runtime.run({
      code: [
        'const loop = {}',
        'loop.self = loop',
        'console.log(loop)',
        "_webout = 'logged'"
      ].join('\n')
    })

    expect(result.error).toBeNull()
    expect(result.webout).toBe('logged')
    expect(result.log).toContain('[object Object]')
  })

  it('carries a byte file through a copy', () => {
    const runtime = loadRuntime()

    const result = runtime.run({
      code: [
        "const from = '/sasjs/drive/files/a.bin'",
        "const to = '/sasjs/drive/files/b.bin'",
        'fs.writeFileSync(from, Uint8Array.from([1, 2, 3]))',
        'fs.copyFileSync(from, to)',
        "_webout = fs.readFileSync(to).toString('base64')"
      ].join('\n')
    })

    expect(result.webout).toBe('AQID')
  })

  it('lists folders and builds the drive tree', async () => {
    const runtime = loadRuntime()
    await seedDrive(runtime, {
      [drivePath('services/public/getdata.js')]: '_webout = "x";',
      [drivePath('data/a.txt')]: 'a'
    })

    const listing = runtime.list(`${appLoc}/services/public`)
    expect(listing.files).toEqual(['getdata.js'])

    const tree = runtime.tree()
    expect(JSON.stringify(tree)).toContain('getdata.js')
    expect(runtime.read(`${appLoc}/data/a.txt`).contents).toBe('a')
  })

  it('reports the files a run changed, and the whole drive on demand', async () => {
    const runtime = loadRuntime()
    await seedDrive(runtime, {
      [drivePath('services/public/getdata.js')]: '_webout = "x";'
    })

    runtime.takeDirty()
    runtime.run({
      code: `require('fs').writeFileSync('/sasjs/drive/files${appLoc}/data/new.txt', 'n');`
    })

    expect(Object.keys(runtime.takeDirty())).toEqual([
      `/sasjs/drive/files${appLoc}/data/new.txt`
    ])
    expect(
      Object.keys(runtime.dumpAll()).some((k) => k.endsWith('new.txt'))
    ).toBe(true)
    // the seed, the three session files and the one the service wrote
    expect(runtime.stats().files).toBe(5)
  })

  it('clears the drive and re-seeds on reset', async () => {
    const runtime = loadRuntime()
    await seedDrive(runtime, {
      [drivePath('services/public/getdata.js')]: '_webout = "seeded";'
    })
    runtime.run({
      code: `require('fs').writeFileSync('/sasjs/drive/files${appLoc}/temp.txt', 't');`
    })
    expect(runtime.dumpAll()[`/sasjs/drive/files${appLoc}/temp.txt`]).toBe('t')

    await runtime.reset()

    expect(runtime.dumpAll()[`/sasjs/drive/files${appLoc}/temp.txt`]).toBe(
      undefined
    )
    expect(
      runtime.run({ program: `${appLoc}/services/public/getdata` }).webout
    ).toBe('seeded')
  })

  it('fails a run that names a program the drive does not hold', () => {
    const runtime = loadRuntime()

    expect(() => runtime.run({ program: 'services/public/missing' })).toThrow(
      /Program not found in drive/
    )
  })
})
