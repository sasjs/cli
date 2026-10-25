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

  it('decodes hex and base64 the way node does, including what it rejects', () => {
    const runtime = loadRuntime()

    const result = runtime.run({
      code: [
        // node stops at the first pair that is not hex, and ignores a trailing
        // nibble
        "const hexCases = ['zz', 'abc', '0g', '504b0304'].map((text) => Buffer.from(text, 'hex').toString('hex'))",
        // node ignores junk characters, drops a lone trailing character, and
        // decodes unpadded input
        "const b64Cases = ['zz', 'A', '!!!', 'UEsDBA'].map((text) => Buffer.from(text, 'base64').length)",
        "_webout = [hexCases.join(','), b64Cases.join(',')].join('|')"
      ].join('\n')
    })

    expect(result.error).toBeNull()
    expect(result.webout).toBe(',ab,,504b0304|1,0,0,4')
  })

  it('clamps a toString range the way node does', () => {
    const runtime = loadRuntime()

    const result = runtime.run({
      code: [
        'const buf = Buffer.from([1, 2, 3, 4])',
        "_webout = [buf.toString('hex', -1), buf.toString('hex', 0, -1), buf.toString('hex', 1, 3), buf.toString('hex', 3, 1)].map((value) => JSON.stringify(value)).join('|')"
      ].join('\n')
    })

    expect(result.webout).toBe('"01020304"|""|"0203"|""')
  })

  it('serialises a Buffer the way node does, with no marker in the JSON', () => {
    const runtime = loadRuntime()

    const result = runtime.run({
      code: "_webout = [JSON.stringify(Buffer.from([80, 75])), Object.keys(Buffer.from([1])).join()].join('|')"
    })

    expect(result.webout).toBe('{"type":"Buffer","data":[80,75]}|0')
  })

  it('does not call an empty byte write a byte body', () => {
    const runtime = loadRuntime()

    // a service that writes no bytes and returns a string can only be answered
    // with that string, so the reply is text rather than base64-decoded text
    const result = runtime.run({
      code: [
        'fs.writeFileSync(weboutPath, new Uint8Array(0))',
        "return 'from the return'"
      ].join('\n')
    })

    expect(result.binary).toBe(false)
    expect(result.webout).toBe('from the return')
  })

  it('handles the encodings node handles, and refuses the rest', () => {
    const runtime = loadRuntime()

    const result = runtime.run({
      code: [
        "const codes = ['utf16le', 'ucs2', 'ascii'].map((encoding) => Buffer.from('PK', encoding).toString('hex'))",
        // node encodes 'ascii' as latin1 and keeps the high bits
        "const latin = Buffer.from('\\u00e9\\u00ff', 'ascii').toString('hex')",
        "const url = Buffer.from([251, 255]).toString('base64url')",
        "const back = Buffer.from('-_8', 'base64url').toString('hex')",
        "const high = Buffer.from([0xc8]).toString('ascii').charCodeAt(0)",
        'let refused = "none"',
        "try { Buffer.from('x', 'not-an-encoding') } catch (e) { refused = e.message }",
        "_webout = [codes.join(','), latin, url, back, high, refused].join('|')"
      ].join('\n')
    })

    expect(result.error).toBeNull()
    // 'P' is 0x50 and 'K' is 0x4b, written little-endian for the utf16 pair;
    // ascii encodes as latin1 (e9ff) and drops the high bit only when decoding
    // 0xc8, leaving 0x48
    expect(result.webout).toBe(
      '50004b00,50004b00,504b|e9ff|-_8|fbff|72|Unknown encoding: not-an-encoding'
    )
  })

  it('decodes the url-safe alphabet and keeps a utf16 byte order mark', () => {
    const runtime = loadRuntime()

    // node's base64 decoder accepts the url-safe characters, and its utf16le
    // decoder keeps a leading BOM as a character
    const result = runtime.run({
      code: [
        "const bytes = Buffer.from('-_8', 'base64')",
        'const bom = Buffer.from([0xff, 0xfe, 0x41, 0x00])',
        "_webout = [bytes.toString('hex'), JSON.stringify(bom.toString('utf16le'))].join('|')"
      ].join('\n')
    })

    expect(result.error).toBeNull()
    expect(result.webout).toBe('fbff|"\ufeffA"')
  })

  it('refuses what node refuses, with the same complaint', () => {
    const runtime = loadRuntime()

    const result = runtime.run({
      code: [
        'const messages = []',
        "try { Buffer.concat(['ab', Buffer.from([1])]) } catch (e) { messages.push(e instanceof TypeError, e.message) }",
        'try { Buffer.byteLength({}) } catch (e) { messages.push(e instanceof TypeError, e.message) }',
        '_webout = messages.join("|")'
      ].join('\n')
    })

    expect(result.webout).toContain(
      'true|The "list[0]" argument must be an instance of Buffer or Uint8Array. Received type string (\'ab\')'
    )
    expect(result.webout).toContain(
      'true|The "string" argument must be of type string or an instance of Buffer or ArrayBuffer. Received an instance of Object'
    )
  })

  it('refuses a write node would refuse, rather than stringifying it', () => {
    const runtime = loadRuntime()

    const result = runtime.run({
      code: [
        'const outcomes = []',
        "try { fs.writeFileSync('/sasjs/drive/files/list.bin', [1, 2, 3]) } catch (e) { outcomes.push(e instanceof TypeError, e.message) }",
        "try { fs.writeFileSync('/sasjs/drive/files/count.txt', 7) } catch (e) { outcomes.push(e instanceof TypeError, e.message) }",
        '_webout = outcomes.join("|")'
      ].join('\n')
    })

    expect(result.webout).toContain(
      'true|The "data" argument must be of type string or an instance of Buffer, TypedArray, or DataView. Received an instance of Array'
    )
    expect(result.webout).toContain('Received type number (7)')
  })

  it('reads text with an encoding, and never mistakes a marker-like value for bytes', () => {
    const runtime = loadRuntime()

    const result = runtime.run({
      code: [
        "const file = '/sasjs/drive/files/notes.txt'",
        // a value that begins with the drive's own binary marker
        "fs.writeFileSync(file, '\\u0000base64:AAAA')",
        'const raw = fs.readFileSync(file)',
        "const b64 = fs.readFileSync(file, 'base64')",
        'const size = fs.statSync(file).size',
        "fs.copyFileSync(file, '/sasjs/drive/files/copy.txt')",
        "const copied = fs.readFileSync('/sasjs/drive/files/copy.txt')",
        '_webout = [raw === "\\u0000base64:AAAA", b64, size, copied === raw].join("|")'
      ].join('\n')
    })

    expect(result.error).toBeNull()
    // base64 of "\u0000base64:AAAA" - the text, not a decode of it
    expect(result.webout).toBe('true|AGJhc2U2NDpBQUFB|12|true')
  })

  it('takes an encoding on an options object, and hands an escaped body back unchanged', () => {
    const runtime = loadRuntime()

    const result = runtime.run({
      code: [
        "const file = '/sasjs/drive/files/notes.txt'",
        "fs.writeFileSync(file, 'plain notes')",
        "const options = fs.readFileSync(file, { encoding: 'utf8' })",
        // a body that looks like the drive's own marker
        "_webout = '\\u0000text:not really escaped'"
      ].join('\n')
    })

    expect(result.error).toBeNull()
    // the webout comes back exactly as written, escape and all
    expect(result.webout).toBe('\u0000text:not really escaped')

    const read = runtime.run({
      code: [
        "const file = '/sasjs/drive/files/notes.txt'",
        "fs.writeFileSync(file, 'plain notes')",
        "_webout = fs.readFileSync(file, { encoding: 'utf8' })"
      ].join('\n')
    })
    expect(read.webout).toBe('plain notes')
  })

  it('hands bytes back for an explicit null encoding, as node does', () => {
    const runtime = loadRuntime()

    const result = runtime.run({
      code: [
        "const file = '/sasjs/drive/files/notes.txt'",
        "fs.writeFileSync(file, 'h\\u00e9llo')",
        'const nulled = fs.readFileSync(file, { encoding: null })',
        'const undef = fs.readFileSync(file, { encoding: undefined })',
        'const plain = fs.readFileSync(file)',
        "_webout = [Buffer.isBuffer(nulled), nulled.toString('base64'), nulled.length, Buffer.isBuffer(undef), undef.length, typeof plain].join('|')"
      ].join('\n')
    })

    expect(result.error).toBeNull()
    // node: fs.readFileSync(f, { encoding: null }) is a Buffer of the utf8 bytes
    expect(result.webout).toBe('true|aMOpbGxv|6|true|6|string')
  })

  it('measures a text file in bytes, as node does', () => {
    const runtime = loadRuntime()

    // a two-byte character: node's statSync().size is the utf8 length
    const result = runtime.run({
      code: [
        "fs.writeFileSync('/sasjs/drive/files/accent.txt', '\\u00e9')",
        "_webout = String(fs.statSync('/sasjs/drive/files/accent.txt').size)"
      ].join('\n')
    })

    expect(result.error).toBeNull()
    expect(result.webout).toBe('2')
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

  it('fills a Buffer.alloc with the value node repeats', () => {
    const runtime = loadRuntime()

    const result = runtime.run({
      code: [
        "const bytes = Buffer.alloc(4, 0xff).toString('hex')",
        "const pair = Buffer.alloc(3, 'ab').toString()",
        "const latin = Buffer.alloc(3, '\\u00e9', 'latin1').toString('hex')",
        "const zeros = Buffer.alloc(2).toString('hex')",
        '_webout = [bytes, pair, latin, zeros].join("|")'
      ].join('\n')
    })

    expect(result.error).toBeNull()
    expect(result.webout).toBe('ffffffff|aba|e9e9e9|0000')
  })

  it('slices as a view, and names a Buffer method the shim does not carry', () => {
    const runtime = loadRuntime()

    const result = runtime.run({
      code: [
        'const whole = Buffer.from([1, 2, 3])',
        'const part = whole.slice(0, 2)',
        'part[0] = 9',
        'let named = "none"',
        "try { whole.write('x') } catch (e) { named = e.message }",
        '_webout = [whole.toString("hex"), part.length, named].join("|")'
      ].join('\n')
    })

    expect(result.error).toBeNull()
    // node's Buffer#slice is a view, so the edit reaches the original
    expect(result.webout).toBe(
      '090203|2|Buffer.write is not implemented in the browser host'
    )
  })

  it('honours the encoding and the append flag node takes on a write', () => {
    const runtime = loadRuntime()

    const result = runtime.run({
      code: [
        "const file = '/sasjs/drive/files/notes.md'",
        "fs.writeFileSync(file, 'one')",
        "fs.writeFileSync(file, '-two', { flag: 'a' })",
        'const appended = fs.readFileSync(file)',
        "const latin = '/sasjs/drive/files/latin.txt'",
        "fs.writeFileSync(latin, '\\u00e9', 'latin1')",
        "const latinHex = fs.readFileSync(latin).toString('hex')",
        "const latinText = fs.readFileSync(latin, 'latin1')",
        "const chunks = '/sasjs/drive/files/chunks.bin'",
        'fs.writeFileSync(chunks, Buffer.from([1, 2]))',
        "fs.writeFileSync(chunks, Buffer.from([3]), { flag: 'a' })",
        "const chunked = fs.readFileSync(chunks).toString('hex')",
        'let refused = "none"',
        "try { fs.writeFileSync(file, 'x', { flag: 'wx' }) } catch (e) { refused = e.message }",
        "_webout = [appended, latinHex, latinText, chunked, refused].join('|')"
      ].join('\n')
    })

    expect(result.error).toBeNull()
    expect(result.webout).toBe(
      "one-two|e9|é|010203|Unsupported flag 'wx' in the browser host - 'w' and 'a' only"
    )
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

  it('takes the offset and length node takes for an ArrayBuffer, and a length for concat', () => {
    const runtime = loadRuntime()

    const result = runtime.run({
      code: [
        'const ab = new Uint8Array([1, 2, 3, 4, 5]).buffer',
        "const chunk = Buffer.from(ab, 2, 2).toString('hex')",
        "const rest = Buffer.from(ab, 2).toString('hex')",
        "const whole = Buffer.from(ab, 'utf8').toString('hex')",
        'let bounds = "none"',
        'try { Buffer.from(ab, 2, 100) } catch (e) { bounds = e.constructor.name }',
        'let offsetError = "none"',
        'try { Buffer.from(ab, 9) } catch (e) { offsetError = e.constructor.name }',
        "const padded = Buffer.concat([Buffer.from([1, 2])], 4).toString('hex')",
        "const cut = Buffer.concat([Buffer.from([1, 2]), Buffer.from([3])], 2).toString('hex')",
        'let badLength = "none"',
        'try { Buffer.concat([Buffer.from([1])], -1) } catch (e) { badLength = e.constructor.name }',
        '_webout = [chunk, rest, whole, bounds, offsetError, padded, cut, badLength].join("|")'
      ].join('\n')
    })

    expect(result.error).toBeNull()
    expect(result.webout).toBe(
      '0304|030405|0102030405|RangeError|RangeError|01020000|0102|RangeError'
    )
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

  it('reports the drive total in bytes, not in stored characters', () => {
    const runtime = loadRuntime()
    runtime.load({})

    runtime.run({
      code: [
        "const file = '/sasjs/drive/files/data/notes.txt'",
        "fs.writeFileSync('/sasjs/drive/files/data/pack.bin', Uint8Array.from([80, 75, 3, 4]))",
        "fs.writeFileSync(file, 'h\\u00e9llo')"
      ].join('\n')
    })

    // the drive total is measured per entry: a byte entry counts its bytes, not
    // the base64 and marker it is stored behind, and text counts utf8 bytes
    const storedBytes = (contents: string) =>
      contents.startsWith('\u0000base64:')
        ? Buffer.from(contents.slice('\u0000base64:'.length), 'base64').length
        : Buffer.byteLength(contents.replace(/^\u0000text:/, ''))

    const drive = runtime.dumpAll()
    const expected = Object.values(drive).reduce(
      (total: number, contents: any) => total + storedBytes(contents),
      0
    )
    const written = Object.keys(drive).filter((k) => k.includes('/data/'))
    expect(written.length).toBe(2)
    expect(runtime.stats().bytes).toBe(expected)
    // the stored representation is longer than the bytes it holds
    expect(
      Object.values(drive).reduce(
        (total: number, contents: any) => total + contents.length,
        0
      )
    ).toBeGreaterThan(expected)
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
