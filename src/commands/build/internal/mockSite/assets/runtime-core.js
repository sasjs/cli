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
  readFileSync(p, opts) {
    const abs = P.resolve(String(p))
    if (!FILES.has(abs)) {
      const err = new Error(
        `ENOENT: no such file or directory, open '${String(p)}'`
      )
      err.code = 'ENOENT'
      throw err
    }
    return FILES.get(abs)
  },
  existsSync(p) {
    const abs = P.resolve(String(p))
    return FILES.has(abs) || DIRS.has(abs)
  },
  writeFileSync(p, data) {
    const abs = P.resolve(String(p))
    mkdirp(P.dirname(abs))
    FILES.set(abs, String(data))
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
      const size = FILES.get(abs).length
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
    FS.writeFileSync(to, FILES.get(src))
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
// Rewritten at boot from host/mock-config.json, which `sasjs mock` generates.
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

  const fn = new Function('require', 'console', 'process', source)

  let thrown = null
  let returned = ''
  try {
    returned = fn(requireShim, sandboxConsole, {
      pid: 4242,
      env: { NODE_ENV: 'browser' }
    })
  } catch (e) {
    thrown = e && e.stack ? e.stack : String(e)
    logLines.push(String(thrown))
  }

  const fromFile = FILES.get(weboutPath) || ''
  const webout = fromFile || (typeof returned === 'string' ? returned : '')

  return {
    webout,
    log: logLines.join('\n'),
    headers: FILES.get(headersPath) || '',
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
  return FILES.get(abs)
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
    bytes: [...FILES.values()].reduce(
      (total, contents) => total + contents.length,
      0
    )
  }),
  run: (payload) => runProgram(payload),
  list: (folder) => listFolder(folder),
  read: (file) => ({ contents: readDriveFile(file) }),
  tree: () => buildTree()
}

self.SASjsMockRuntime = api

if (typeof module !== 'undefined') module.exports = api
