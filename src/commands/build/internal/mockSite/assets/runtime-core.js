/**
 * Browser runtime host for a project's JS stored programs.
 *
 * Runs the sasjs/server JS "stored program" contract inside a Web Worker:
 * a generated wrapper declares the request parameters as module-scope consts,
 * predeclares `fs` / `weboutPath` / `_SASJS_*` exactly as
 * controllers/internal/createJSProgram.ts does, executes the program text, and
 * the program's `_webout` assignment is read back from the virtual drive.
 *
 * The virtual drive seeds from vfs-seed.json, which holds the project's own
 * JS services unchanged, so the services themselves are not adapted in any
 * way.
 *
 * CONTRACT. A stored program gets what the server's generated wrapper gives it:
 * the request parameters as module-scope consts (`_program` included), the
 * uploaded tables as `_WEBIN_*` refs, `fs`/`path`/`crypto` from require(),
 * `Buffer`, and `_webout` / `weboutPath` / `_SASJS_WEBOUT_HEADERS`. Two ways to
 * answer a request:
 *
 *   1. text - assign `_webout`, or write a string to `weboutPath`;
 *   2. bytes - write an ArrayBuffer, a TypedArray or a Buffer to `weboutPath`,
 *      the way a service that streams a file does on the server.
 *
 * In both cases the response headers are whatever lines the service wrote to
 * `_SASJS_WEBOUT_HEADERS` (`Content-type`, `Content-Disposition`); the host
 * applies them to the response. A byte body comes back to the host as base64
 * with a `binary` flag, because the drive itself holds strings.
 *
 * One place the drive is not node: `fs.readFileSync` without an encoding hands
 * TEXT back as text, which is what a service reading a config, a CSV or a
 * service file expects - a byte file still reads back as a Buffer, and an
 * encoding returns a string for either, as node does.
 */

if (typeof importScripts === 'function') importScripts('/host/md5.js')

// ---------------------------------------------------------------- posix path
const P = {
  sep: '/',
  normalise(p) {
    const isAbs = p.charAt(0) === '/'
    const out = []
    for (const part of p.split('/')) {
      if (!part || part === '.') continue
      if (part === '..') {
        if (out.length && out[out.length - 1] !== '..') out.pop()
        else if (!isAbs) out.push('..')
      } else out.push(part)
    }
    const joined = out.join('/')
    return isAbs ? '/' + joined : joined || '.'
  },
  join(...args) {
    return (
      this.normalise(
        args
          .filter((a) => a !== undefined && a !== null && String(a) !== '')
          .join('/')
      ) || '.'
    )
  },
  resolve(...args) {
    let resolved = ''
    for (let i = args.length - 1; i >= 0; i--) {
      const a = String(args[i] === undefined || args[i] === null ? '' : args[i])
      if (!a) continue
      resolved = a + '/' + resolved
      if (a.charAt(0) === '/') break
    }
    if (resolved.charAt(0) !== '/') resolved = '/' + resolved
    return this.normalise(resolved)
  },
  dirname(p) {
    const n = this.normalise(p)
    const i = n.lastIndexOf('/')
    return i <= 0 ? '/' : n.slice(0, i)
  },
  basename(p) {
    const n = this.normalise(p)
    return n.slice(n.lastIndexOf('/') + 1)
  },
  extname(p) {
    const b = this.basename(p)
    const i = b.lastIndexOf('.')
    return i > 0 ? b.slice(i) : ''
  }
}

// ------------------------------------------------------------ binary values
// The drive holds strings: it is persisted as JSON in IndexedDB and seeded from
// a JSON file. A file a service writes as bytes is therefore stored as base64
// behind a marker, which keeps the representation self-describing - a drive
// restored from a snapshot still knows which entries are base64 - and no text
// file starts with a NUL.
const BINARY_PREFIX = '\u0000base64:'
// a text file that would otherwise look like a marker is stored behind this, so
// a value a service wrote can never be mistaken for a byte entry
const TEXT_PREFIX = '\u0000text:'
const BUFFER_MARK = '__sasjsBuffer'
const CHUNK = 0x8000

const chunked = (bytes) => {
  let out = ''
  for (let i = 0; i < bytes.length; i += CHUNK)
    out += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK))
  return out
}

const bytesToBase64 = (bytes) => btoa(chunked(bytes))

/**
 * Node's base64 decoding: the url-safe alphabet counts, anything that is not a
 * base64 character is ignored, and a leftover single character (which cannot be
 * decoded) is dropped rather than throwing.
 */
const base64ToBytes = (base64) => {
  const clean = String(base64)
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .replace(/[^A-Za-z0-9+/]/g, '')
  const usable = clean.length % 4 === 1 ? clean.slice(0, -1) : clean
  try {
    return Uint8Array.from(atob(usable), (char) => char.charCodeAt(0))
  } catch (e) {
    return new Uint8Array(0)
  }
}

/** Node's hex decoding: pairs, stopping at the first pair that is not hex. */
const hexToBytes = (value) => {
  const text = String(value)
  const bytes = []
  for (let i = 0; i + 1 < text.length; i += 2) {
    const pair = text.slice(i, i + 2)
    if (!/^[0-9a-fA-F]{2}$/.test(pair)) break
    bytes.push(parseInt(pair, 16))
  }
  return Uint8Array.from(bytes)
}

/**
 * What node accepts as raw bytes: a Buffer or other Uint8Array, an ArrayBuffer,
 * or a view over one. Arrays and strings are not bytes here - node rejects them
 * where it wants a buffer, and a mock that quietly accepts them hides a service
 * that would fail on the server.
 */
const asBufferInput = (value) => {
  if (value instanceof Uint8Array) return value
  if (value instanceof ArrayBuffer) return new Uint8Array(value)
  if (ArrayBuffer.isView(value))
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
  return null
}

/**
 * The bytes behind a value Buffer.from accepts: the byte-like inputs plus a
 * plain array of numbers, which node allows there and nowhere else.
 */
const asBytes = (data) => {
  const bytes = asBufferInput(data)
  if (bytes) return bytes
  if (Array.isArray(data)) return Uint8Array.from(data)
  return null
}

/** How node names a value it refused, so the error names the same rule. */
const describeValue = (value) => {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'an instance of Array'
  if (typeof value === 'string') return `type string ('${value}')`
  if (typeof value !== 'object')
    return `type ${typeof value} (${String(value)})`
  return 'an instance of Object'
}

const base64Size = (base64) =>
  Math.floor((base64.length * 3) / 4) -
  (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0)

const isBinary = (contents) =>
  typeof contents === 'string' && contents.startsWith(BINARY_PREFIX)

/** The text a stored entry holds, with the escape for a marker-like value off. */
const entryText = (contents) =>
  contents.startsWith(TEXT_PREFIX)
    ? contents.slice(TEXT_PREFIX.length)
    : contents

/** What the drive stores for a string a service wrote. */
const encodeText = (data) =>
  data.startsWith('\u0000') ? TEXT_PREFIX + data : data

const utf8Encoder = new TextEncoder()
const utf8Decoder = new TextDecoder()
const utf16Decoder = new TextDecoder('utf-16le', { ignoreBOM: true })

/**
 * The byte length node reports for a stored entry: a byte entry decodes to its
 * own length, and a text entry is measured as utf8. The marker prefixes are a
 * storage detail and never count.
 */
const entrySize = (contents) =>
  isBinary(contents)
    ? base64Size(contents.slice(BINARY_PREFIX.length))
    : utf8Encoder.encode(entryText(contents)).length

/** node's names for its encodings, including the aliases it accepts. */
const ENCODINGS = [
  'utf8',
  'utf-8',
  'base64',
  'base64url',
  'hex',
  'binary',
  'latin1',
  'ascii',
  'utf16le',
  'utf-16le',
  'ucs2',
  'ucs-2'
]

const normaliseEncoding = (encoding) => {
  const how = String(encoding || 'utf8').toLowerCase()
  if (how === 'utf-8') return 'utf8'
  if (how === 'ucs2' || how === 'ucs-2' || how === 'utf-16le') return 'utf16le'
  return how
}

/** node refuses an encoding it does not implement, rather than guessing utf8. */
const assertEncoding = (encoding) => {
  const how = normaliseEncoding(encoding)
  if (!ENCODINGS.includes(how))
    throw new TypeError(`Unknown encoding: ${String(encoding)}`)
  return how
}

const toBase64Url = (base64) =>
  base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

const fromBase64Url = (base64url) =>
  String(base64url).replace(/-/g, '+').replace(/_/g, '/')

const bytesToString = (bytes, encoding) => {
  switch (assertEncoding(encoding)) {
    case 'base64':
      return bytesToBase64(bytes)
    case 'base64url':
      return toBase64Url(bytesToBase64(bytes))
    case 'hex':
      return [...bytes]
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('')
    case 'binary':
    case 'latin1':
      return chunked(bytes)
    case 'ascii':
      // node's ascii decode drops the high bit
      return chunked(Uint8Array.from(bytes, (byte) => byte & 0x7f))
    case 'utf16le':
      return utf16Decoder.decode(bytes)
    default:
      return utf8Decoder.decode(bytes)
  }
}

/**
 * Gives a Uint8Array the decoding a Buffer has, and makes a view of it a Buffer
 * too - a service that chunks a file with `subarray(i, j)` then decodes each
 * chunk gets the chunk, not "80,75". The mark is non-enumerable and the value
 * serialises as node's Buffer does, so a service putting one in a JSON body
 * gets the same response from the mock as from the server.
 */
const decorate = (view) => {
  // the mark and the methods stay out of Object.keys and for..in, as they are
  // on node's Buffer, where they live on the prototype
  const hide = (name, value) =>
    Object.defineProperty(view, name, {
      value,
      writable: true,
      configurable: true
    })

  hide(BUFFER_MARK, true)
  hide('toString', (encoding, start, end) => {
    // node clamps a negative start to 0 and a negative end to 0, so an end
    // below the start yields nothing rather than counting back from the end
    const from = Math.max(0, start === undefined ? 0 : start)
    const to = Math.max(0, end === undefined ? view.length : end)
    if (to <= from) return ''
    return bytesToString(
      Uint8Array.prototype.subarray.call(view, from, to),
      encoding
    )
  })
  hide('subarray', (start, end) =>
    decorate(Uint8Array.prototype.subarray.call(view, start, end))
  )
  hide('slice', (start, end) =>
    decorate(Uint8Array.prototype.slice.call(view, start, end))
  )
  hide('toJSON', () => ({ type: 'Buffer', data: Array.from(view) }))
  return view
}

/**
 * A minimal Buffer, for the writes a streaming service makes:
 * `Buffer.from(bytes)` and `Buffer.from(base64, 'base64')`. What it returns is
 * a Uint8Array that also decodes itself, so a service writes it straight to the
 * webout and reads it back the way node returns one.
 */
const asBuffer = (bytes) => decorate(new Uint8Array(bytes))

const BUFFERS = {
  /**
   * node's Buffer.from overloads: (string, encoding), (arrayBuffer, byteOffset,
   * length), and a single argument for anything else. The offset and length are
   * read only for an ArrayBuffer - node ignores them for the contents of a view,
   * so a chunk comes from subarray, not from a second argument.
   */
  from(value, offsetOrEncoding, length) {
    if (typeof value === 'string') {
      switch (assertEncoding(offsetOrEncoding)) {
        case 'base64':
          return asBuffer(base64ToBytes(value))
        case 'base64url':
          return asBuffer(base64ToBytes(fromBase64Url(value)))
        case 'hex':
          return asBuffer(hexToBytes(value))
        case 'binary':
        case 'latin1':
          return asBuffer(
            Uint8Array.from(value, (char) => char.charCodeAt(0) & 0xff)
          )
        case 'ascii':
          return asBuffer(
            Uint8Array.from(value, (char) => char.charCodeAt(0) & 0x7f)
          )
        case 'utf16le': {
          const bytes = new Uint8Array(value.length * 2)
          for (let i = 0; i < value.length; i++) {
            const code = value.charCodeAt(i)
            bytes[i * 2] = code & 0xff
            bytes[i * 2 + 1] = code >> 8
          }
          return asBuffer(bytes)
        }
        default:
          return asBuffer(utf8Encoder.encode(value))
      }
    }
    if (value instanceof ArrayBuffer) {
      // a non-numeric second argument is not an offset, it is node's encoding
      // slot, and node ignores it here rather than rejecting it
      const start =
        typeof offsetOrEncoding === 'number' ? Math.trunc(offsetOrEncoding) : 0
      const end =
        typeof length === 'number'
          ? start + Math.trunc(length)
          : value.byteLength
      if (start < 0 || start > value.byteLength)
        throw new RangeError(
          `Start offset ${String(offsetOrEncoding)} is outside the bounds of the buffer`
        )
      if (end < start || end > value.byteLength)
        throw new RangeError('"length" is outside of buffer bounds')
      return asBuffer(new Uint8Array(value, start, end - start))
    }
    const bytes = asBytes(value)
    if (!bytes)
      throw new TypeError('Buffer.from: unsupported input in the browser host')
    return asBuffer(bytes)
  },
  alloc: (size) => asBuffer(new Uint8Array(size || 0)),
  concat(list, totalLength) {
    const items = list || []
    const parts = items.map((item, index) => {
      const bytes = asBufferInput(item)
      if (!bytes)
        throw new TypeError(
          `The "list[${index}]" argument must be an instance of Buffer or Uint8Array. Received ${describeValue(item)}`
        )
      return bytes
    })
    const written = parts.reduce((sum, part) => sum + part.length, 0)
    // node pads with zeros when totalLength is longer than the parts and cuts
    // them short when it is shorter, rather than ignoring the argument
    const total = totalLength === undefined ? written : totalLength
    if (typeof total !== 'number')
      throw new TypeError(
        `The "length" argument must be of type number. Received ${describeValue(totalLength)}`
      )
    if (!Number.isInteger(total) || total < 0)
      throw new RangeError(
        `The value of "length" is out of range. It must be ${total < 0 ? '>= 0' : 'an integer'}. Received ${total}`
      )
    const out = new Uint8Array(total)
    let offset = 0
    for (const part of parts) {
      if (offset >= total) break
      const room = Math.min(part.length, total - offset)
      out.set(part.subarray(0, room), offset)
      offset += room
    }
    return asBuffer(out)
  },
  isBuffer: (value) => !!(value && value[BUFFER_MARK]),
  byteLength(value, encoding) {
    if (typeof value === 'string') return BUFFERS.from(value, encoding).length
    const bytes = asBufferInput(value)
    if (bytes) return bytes.length
    throw new TypeError(
      `The "string" argument must be of type string or an instance of Buffer or ArrayBuffer. Received ${describeValue(value)}`
    )
  }
}

BUFFERS.allocUnsafe = BUFFERS.alloc

// ------------------------------------------------------------- virtual drive
const FILES = new Map() // absolute path -> string contents
const DIRS = new Set(['/'])

// ------------------------------------------------------------ persistence
// The drive lives in this worker's memory. IndexedDB is owned by the PAGE
// (a service worker can be terminated between requests, and in some browsers
// worker and page storage are not shared), so the page hands the drive in at
// boot and receives the changed files back after each run.
const dirty = new Map() // abs path -> contents, or null when deleted

const markDirty = (path) => {
  const contents = FILES.has(path) ? FILES.get(path) : null
  dirty.set(path, contents)
}

const takeDirty = () => {
  const out = {}
  for (const [path, contents] of dirty) out[path] = contents
  dirty.clear()
  return out
}

const dumpAll = () => {
  const out = {}
  for (const [path, contents] of FILES) out[path] = contents
  return out
}

const loadSnapshot = (files) => {
  FILES.clear()
  DIRS.clear()
  DIRS.add('/')
  mkdirp(DRIVE_APP)
  mkdirp(`${DRIVE_ROOT}/files`)
  for (const [path, contents] of Object.entries(files || {})) {
    if (typeof contents !== 'string') continue
    FILES.set(P.resolve(path), contents)
    mkdirp(P.dirname(path))
  }
  lastBoot = {
    booted: true,
    restored: true,
    files: FILES.size,
    at: new Date().toISOString()
  }
  return lastBoot
}

const mkdirp = (dir) => {
  const parts = P.normalise(dir).split('/').filter(Boolean)
  let acc = ''
  for (const part of parts) {
    acc += '/' + part
    DIRS.add(acc)
  }
}

const FS = {
  readFileSync(p, options) {
    const abs = P.resolve(String(p))
    if (!FILES.has(abs)) {
      const err = new Error(
        `ENOENT: no such file or directory, open '${String(p)}'`
      )
      err.code = 'ENOENT'
      throw err
    }
    // node takes the encoding either bare or on an options object. An explicit
    // `{ encoding: null }` is node's ask for a Buffer, so it is not the same as
    // no encoding at all - the key has to be told apart from its value.
    const onOptions = options && typeof options === 'object'
    const encoding = onOptions ? options.encoding : options
    const contents = FILES.get(abs)
    const bytes = isBinary(contents)
      ? BUFFERS.from(contents.slice(BINARY_PREFIX.length), 'base64')
      : null
    // an encoding asks for a string, as it does in node; without one the drive
    // hands text back as text (a service reading a config or a CSV expects
    // that) and a byte file back as bytes
    if (encoding) {
      const how = assertEncoding(encoding)
      return bytes
        ? bytes.toString(how)
        : BUFFERS.from(entryText(contents)).toString(how)
    }
    // an encoding key present but null: node hands back the Buffer, so a text
    // entry is its utf8 bytes
    if (onOptions && 'encoding' in options)
      return bytes || asBuffer(utf8Encoder.encode(entryText(contents)))
    return bytes || entryText(contents)
  },
  existsSync(p) {
    const abs = P.resolve(String(p))
    return FILES.has(abs) || DIRS.has(abs)
  },
  writeFileSync(p, data) {
    const abs = P.resolve(String(p))
    mkdirp(P.dirname(abs))
    // text, or the bytes node lets a service write: an array, a number or null
    // is an error there, so it is one here too rather than a silent "1,2,3" in
    // the file that fails on the server
    if (typeof data !== 'string') {
      const bytes = asBufferInput(data)
      if (!bytes)
        throw new TypeError(
          `The "data" argument must be of type string or an instance of Buffer, TypedArray, or DataView. Received ${describeValue(data)}`
        )
      FILES.set(abs, BINARY_PREFIX + bytesToBase64(bytes))
      markDirty(abs)
      return
    }
    FILES.set(abs, encodeText(data))
    markDirty(abs)
  },
  writeFile(p, data, cb) {
    try {
      FS.writeFileSync(p, data)
      if (cb) cb(null)
    } catch (e) {
      if (cb) cb(e)
      else throw e
    }
  },
  mkdirSync(p) {
    mkdirp(P.resolve(String(p)))
  },
  readdirSync(p) {
    const abs = P.resolve(String(p))
    const pre = abs === '/' ? '/' : abs + '/'
    const out = new Set()
    for (const k of FILES.keys()) {
      if (k.startsWith(pre)) {
        const rest = k.slice(pre.length)
        if (rest && !rest.includes('/')) out.add(rest)
      }
    }
    for (const d of DIRS) {
      if (d.startsWith(pre)) {
        const rest = d.slice(pre.length)
        if (rest && !rest.includes('/')) out.add(rest)
      }
    }
    return [...out].sort()
  },
  statSync(p) {
    const abs = P.resolve(String(p))
    if (DIRS.has(abs))
      return { isDirectory: () => true, isFile: () => false, size: 0 }
    if (FILES.has(abs)) {
      const size = entrySize(FILES.get(abs))
      return { isDirectory: () => false, isFile: () => true, size }
    }
    const err = new Error(
      `ENOENT: no such file or directory, stat '${String(p)}'`
    )
    err.code = 'ENOENT'
    throw err
  },
  unlinkSync(p) {
    const abs = P.resolve(String(p))
    FILES.delete(abs)
    markDirty(abs)
  },
  copyFileSync(from, to) {
    const src = P.resolve(String(from))
    if (!FILES.has(src))
      throw new Error(`ENOENT: no such file, copy '${String(from)}'`)
    // copy the stored representation verbatim, so a byte file stays bytes and a
    // text file is not re-escaped
    const abs = P.resolve(String(to))
    mkdirp(P.dirname(abs))
    FILES.set(abs, FILES.get(src))
    markDirty(abs)
  }
}

const CRYPTO = {
  createHash(alg) {
    if (String(alg).toLowerCase() !== 'md5')
      throw new Error(`Unsupported hash in browser host: ${alg}`)
    let buf = ''
    return {
      update(s) {
        buf += String(s)
        return this
      },
      digest(enc) {
        const hex = MD5(buf)
        return enc === 'hex' ? hex : hex
      }
    }
  }
}

const requireShim = (name) => {
  switch (name) {
    case 'path':
      return P
    case 'fs':
      return FS
    case 'crypto':
      return CRYPTO
    default:
      throw new Error(
        `Cannot find module '${name}' in the browser runtime host`
      )
  }
}

// ------------------------------------------------------------------ commands
const DRIVE_ROOT = '/sasjs/drive'
// Rewritten at boot from host/mock-config.json, which the mock build writes.
let APP_LOC = '/Public/app'
let DRIVE_APP = `${DRIVE_ROOT}/files${APP_LOC}`
const SEED_PATH = '/host/vfs-seed.json'
const SNAPSHOT_PATH = '/host/vfs-snapshot.json'

/**
 * Reads the generated mock-config.json (appLoc and provenance). Absent or
 * malformed, the defaults above apply - a demo can then only work when the
 * services sit under the default appLoc.
 */
const loadMockConfig = async () => {
  try {
    const res = await fetch('/host/mock-config.json', { cache: 'no-store' })
    if (!res.ok) return
    const cfg = await res.json()
    if (cfg && typeof cfg.appLoc === 'string' && cfg.appLoc.trim()) {
      APP_LOC = '/' + cfg.appLoc.replace(/^\/+/, '').replace(/\/+$/, '')
      DRIVE_APP = `${DRIVE_ROOT}/files${APP_LOC}`
    }
  } catch (e) {
    /* keep the defaults */
  }
}

let sessionSeq = 0

const formatArg = (a) => {
  if (typeof a === 'string') return a
  try {
    return JSON.stringify(a)
  } catch (e) {
    return String(a)
  }
}

const PROGRAM_FOLDERS = ['services', 'jobs', 'tests']

/**
 * Resolves a program reference the way the server does: an exact drive path,
 * with the runtime extension tried. The adapter sends a full path, and prepends
 * the appLoc when the app passes one without a leading slash, so a reference
 * naming no program folder (e.g. "getdata", or "<appLoc>/getdata") is also
 * tried under services, jobs and tests below the appLoc.
 */
const resolveProgram = (program) => {
  const relative = String(program).replace(/^\/+/, '')
  const roots = [P.resolve(DRIVE_ROOT, 'files', relative)]

  const namesAFolder = PROGRAM_FOLDERS.some(
    (folder) => relative === folder || relative.startsWith(folder + '/')
  )
  if (!namesAFolder) {
    // DRIVE_APP already carries the appLoc, and it is absolute: joining it with
    // P.resolve keeps the drive prefix that the literal appLoc would replace.
    const underAppLoc = relative.startsWith(APP_LOC.slice(1) + '/')
      ? relative.slice(APP_LOC.length)
      : relative
    for (const folder of PROGRAM_FOLDERS) {
      roots.push(P.join(DRIVE_APP, folder, underAppLoc))
    }
  }

  for (const root of roots) {
    for (const candidate of [root, root + '.js', root + '.sas']) {
      if (FILES.has(candidate)) return candidate
    }
  }

  return null
}

const runProgram = ({ program, code, params = {}, tables = [] }) => {
  const payloadCode = code
  const codePath = program ? resolveProgram(program) : null
  if (!codePath && !payloadCode)
    throw new Error(`Program not found in drive: ${program}`)

  const logLines = []
  const sandboxConsole = {}
  for (const level of ['log', 'info', 'warn', 'error', 'debug']) {
    sandboxConsole[level] = (...args) => {
      const line = args.map(formatArg).join(' ')
      logLines.push(line)
      // eslint-disable-next-line no-console
      console[level === 'debug' ? 'log' : level](`[service] ${line}`)
    }
  }

  const sessionDir = `/sasjs/sessions/s${++sessionSeq}`
  mkdirp(sessionDir)
  const weboutPath = `${sessionDir}/webout.txt`
  const headersPath = `${sessionDir}/stpsrv_header.txt`
  const tokenFile = `${sessionDir}/reqHeaders.txt`
  FILES.set(weboutPath, '')
  FILES.set(headersPath, '')
  FILES.set(tokenFile, '')

  const varStatements = Object.entries(params)
    .filter(([name]) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(name))
    .map(([name, value]) => `const ${name} = ${JSON.stringify(String(value))};`)
    .join('\n')

  const webinStatements = []
  tables.forEach((table, idx) => {
    const n = idx + 1
    webinStatements.push(
      `const _WEBIN_NAME${n} = ${JSON.stringify(table.name)};`
    )
    webinStatements.push(
      `const _WEBIN_FILENAME${n} = ${JSON.stringify(table.filename)};`
    )
    webinStatements.push(
      `const _WEBIN_FILEREF${n} = ${JSON.stringify(table.csv)};`
    )
  })
  webinStatements.push(`const _WEBIN_FILE_COUNT = ${tables.length};`)

  const preProgram = `
let _webout = '';
const weboutPath = ${JSON.stringify(weboutPath)};
const _SASJS_TOKENFILE = ${JSON.stringify(tokenFile)};
const _SASJS_WEBOUT_HEADERS = ${JSON.stringify(headersPath)};
const _SASJS_USERNAME = "DEMO";
const _SASJS_USERID = "0";
const _SASJS_DISPLAYNAME = "Demo User";
const _METAPERSON = _SASJS_DISPLAYNAME;
const _METAUSER = _SASJS_USERNAME;
const SASJSPROCESSMODE = 'Stored Program';
`

  const source = `
const fs = require('fs');
${varStatements}
${webinStatements.join('\n')}
${preProgram}
${payloadCode || FILES.get(codePath)}
if (_webout) { fs.writeFile(weboutPath, _webout, function () {}); }
return _webout;
`

  const fn = new Function('require', 'console', 'process', 'Buffer', source)

  let thrown = null
  let returned = ''
  try {
    returned = fn(
      requireShim,
      sandboxConsole,
      {
        pid: 4242,
        env: { NODE_ENV: 'browser' }
      },
      BUFFERS
    )
  } catch (e) {
    thrown = e && e.stack ? e.stack : String(e)
    logLines.push(String(thrown))
  }

  const stored = FILES.get(weboutPath) || ''
  // binary only when the byte body is the body: an empty byte write falls back
  // to the returned string, and flagging that as bytes would have the worker
  // base64-decode text
  const fromFile = isBinary(stored)
    ? stored.slice(BINARY_PREFIX.length)
    : entryText(stored)
  const binary = !!fromFile && isBinary(stored)
  const webout = fromFile || (typeof returned === 'string' ? returned : '')

  return {
    webout,
    log: logLines.join('\n'),
    headers: entryText(FILES.get(headersPath) || ''),
    // a byte body travels to the host as base64, which is how it is stored
    binary,
    error: thrown
  }
}

const listFolder = (folderPath) => {
  const abs = folderPath
    ? P.resolve(
        DRIVE_APP,
        String(folderPath)
          .replace(/^\/+/, '')
          .replace(new RegExp('^' + APP_LOC + '/'), '')
      )
    : DRIVE_APP
  const alt = folderPath
    ? P.resolve(DRIVE_ROOT, 'files', String(folderPath).replace(/^\/+/, ''))
    : DRIVE_APP
  const target = DIRS.has(abs) ? abs : alt
  if (!DIRS.has(target) && !FILES.has(target)) {
    const err = new Error(`Folder doesn't exist.`)
    err.status = 404
    throw err
  }
  const pre = target === '/' ? '/' : target + '/'
  const files = []
  const folders = []
  for (const k of FILES.keys()) {
    if (k.startsWith(pre)) {
      const rest = k.slice(pre.length)
      if (!rest.includes('/')) files.push(rest)
    }
  }
  for (const d of DIRS) {
    if (d.startsWith(pre)) {
      const rest = d.slice(pre.length)
      if (rest && !rest.includes('/')) folders.push(rest)
    }
  }
  return { files: files.sort(), folders: folders.sort() }
}

const readDriveFile = (filePath) => {
  const abs = P.resolve(
    DRIVE_ROOT,
    'files',
    String(filePath).replace(/^\/+/, '')
  )
  if (!FILES.has(abs)) {
    const err = new Error('File not found')
    err.status = 404
    throw err
  }
  const contents = FILES.get(abs)
  // the host turns a base64 entry back into bytes before it answers with it,
  // and takes the escape off a text entry
  return isBinary(contents)
    ? { contents: contents.slice(BINARY_PREFIX.length), binary: true }
    : { contents: entryText(contents), binary: false }
}

const buildTree = () => {
  const walk = (dir) => {
    const node = {
      name: P.basename(dir) || 'files',
      relativePath: dir.slice(DRIVE_ROOT.length + '/files'.length),
      absolutePath: dir,
      isFolder: true,
      children: []
    }
    node.relativePath = node.relativePath === '' ? '' : node.relativePath
    for (const child of FS.readdirSync(dir)) {
      const childAbs = `${dir}/${child}`
      if (DIRS.has(childAbs)) node.children.push(walk(childAbs))
      else {
        node.children.push({
          name: child,
          relativePath: childAbs.slice(DRIVE_ROOT.length + '/files'.length),
          absolutePath: childAbs,
          isFolder: false,
          children: []
        })
      }
    }
    return node
  }
  return { status: 'success', tree: walk(`${DRIVE_ROOT}/files`) }
}

// -------------------------------------------------------------------- boot
let ready = null
let lastBoot = null

/**
 * Loads the drive the site ships with. A snapshot wins over the plain seed: it
 * is a complete drive captured after a project's own services had run (a
 * seeded demo site, for instance), so a visitor starts from data instead of
 * from an empty drive.
 */
const fetchDrive = async () => {
  for (const [source, url] of [
    ['snapshot', SNAPSHOT_PATH],
    ['seed', SEED_PATH]
  ]) {
    try {
      const res = await fetch(url, { cache: 'no-store' })
      if (!res.ok) continue
      const body = await res.json()
      const files = body && body.files ? body.files : body
      if (files && typeof files === 'object') return { source, files }
    } catch (e) {
      /* fall through to the next source */
    }
  }

  throw new Error(
    'No drive to load: neither ' +
      SNAPSHOT_PATH +
      ' nor ' +
      SEED_PATH +
      ' could be read'
  )
}

const boot = async () => {
  await loadMockConfig()
  const { source, files: seed } = await fetchDrive()
  mkdirp(DRIVE_APP)
  mkdirp(`${DRIVE_ROOT}/files`)
  for (const [path, contents] of Object.entries(seed)) {
    FILES.set(P.resolve(path), contents)
    mkdirp(P.dirname(path))
  }
  dirty.clear()

  // No bootstrap: seeding a drive is an ordinary service call, made by the app
  // (or an operator) the same way it would be against a server. The host knows
  // nothing about what a project's services do.
  // Mark the whole drive dirty once, so the host persists a COMPLETE snapshot:
  // later restores then need no merging with the seed, and a deleted file (a
  // seeder service that removes itself) stays deleted.
  for (const path of FILES.keys()) markDirty(path)

  lastBoot = {
    booted: true,
    restored: false,
    source,
    files: FILES.size,
    at: new Date().toISOString()
  }
  return lastBoot
}

const reset = async () => {
  FILES.clear()
  DIRS.clear()
  DIRS.add('/')
  dirty.clear()
  started = true
  const p = boot()
  ready = p
  if (resolveBoot) resolveBoot(p)
  await p
  return true
}

// Nothing runs until the host says whether it has a persisted drive or wants
// a fresh seed; ensureReady() seeds after a short grace if it hears neither.
let started = false
let resolveBoot
ready = new Promise((resolve) => {
  resolveBoot = resolve
})

const api = {
  ensureReady: async () => {
    if (!started) {
      await new Promise((r) => setTimeout(r, 600))
    }
    if (!started) await api.seed()
    await ready
    return true
  },
  // Called by the host with the persisted drive; skips seeding entirely.
  load: (files) => {
    started = true
    const info = loadSnapshot(files)
    ready = Promise.resolve(info)
    if (resolveBoot) resolveBoot(info)
    return ready
  },
  seed: () => {
    started = true
    const p = boot().catch((e) => ({
      booted: false,
      error: (e && e.message) || String(e)
    }))
    ready = p
    if (resolveBoot) resolveBoot(p)
    return p
  },
  reset: () => reset(),
  takeDirty: () => takeDirty(),
  dumpAll: () => dumpAll(),
  bootInfo: () => lastBoot,
  stats: () => ({
    files: FILES.size,
    // the drive's total in bytes, measured per entry the way statSync does it -
    // the stored representation's own length would count the marker and the
    // base64 expansion instead
    bytes: [...FILES.values()].reduce(
      (total, contents) => total + entrySize(contents),
      0
    )
  }),
  run: (payload) => runProgram(payload),
  list: (folder) => listFolder(folder),
  read: (file) => readDriveFile(file),
  tree: () => buildTree()
}

self.SASjsMockRuntime = api

if (typeof module !== 'undefined') module.exports = api
