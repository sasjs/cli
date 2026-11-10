import { createHash } from 'crypto'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { buildSync as esbuildSync } from 'esbuild'
import { DEFAULT_IDENTITY, parseIdentity } from '@sasjs/api'
import { folderExists, getWeboutPrelude, Target } from '@sasjs/utils'

export interface MockSiteResult {
  outputFolder: string
  appLoc: string
  /** Drive entries written into the seed (programs plus any other content). */
  driveEntries: number
  /** Executable .js programs found under services, jobs or tests. */
  jsPrograms: number
  webFileCount: number
  /** True when a captured drive snapshot was shipped with the site. */
  snapshot: boolean
  /** True when a recorded SAS session was shipped, for .sas runs to answer. */
  sasTranscript: boolean
  /**
   * Which identity fixture the site signs in with: the package's demo fixture,
   * or `mock-identity.json` from the project.
   */
  identitySource: 'default' | 'mock-identity.json'
}

/**
 * The webout() block is the one @sasjs/utils generates for the server, emitted
 * here with sentinel values and filled in per run by runtime-core.js. That is
 * what makes a service behave identically as a stored program and in a mock
 * build: one copy of the block, one set of paths, one envelope.
 *
 * The sentinels are quoted in the emitted text (they are JSON string literals),
 * so the substitution replaces the whole literal and never a fragment.
 */
export const WEBOUT_SENTINELS = {
  weboutPath: '__SASJS_WEBOUT_PATH__',
  headersPath: '__SASJS_WEBOUT_HEADERS__',
  program: '__SASJS_WEBOUT_PROGRAM__',
  debug: '__SASJS_WEBOUT_DEBUG__',
  username: '__SASJS_WEBOUT_USERNAME__',
  userId: '__SASJS_WEBOUT_USERID__',
  apiServerUrl: '__SASJS_WEBOUT_APIURL__'
}

const ASSETS_FOLDER = path.join(__dirname, 'assets')

/**
 * The browser build of @sasjs/api, from the installed package rather than a copy
 * in this folder: the worker answers the drive with the same rules sasjs/server
 * does, so the version that ships is the version the CLI resolves - and a stale
 * second copy is exactly the drift the package exists to remove.
 *
 * The path is walked from `require.resolve` because `exports` in @sasjs/api
 * exposes only the package root - `require.resolve('@sasjs/api/browser.js')`
 * fails with ERR_PACKAGE_PATH_NOT_EXPORTED, and no subpath can reach
 * `build/browser.js`. The walk lands on that file only while `main` stays
 * `build/cjs/index.js`; a change to `main` or `exports` in the package repoints
 * it silently, so a missing file is reported by name rather than as a bare
 * ENOENT three levels up.
 */
const API_BROWSER_BUILD = path.join(
  path.dirname(require.resolve('@sasjs/api')),
  '..',
  '..',
  'build',
  'browser.js'
)

const toPosix = (value: string) => value.split(path.sep).join('/')

/**
 * The linter, as a service worker can run it.
 *
 * `@sasjs/api/code` is a node-only entry because `@sasjs/lint` resolves its
 * configuration by walking a filesystem - but the linter's core (`lintText`,
 * `formatText`) reads only the text it is given and the configuration it is
 * passed, so the two can run anywhere the module graph can be built. This
 * bundle is that graph: the package's own code service, the linter it wraps, and
 * shims for the four node modules reached at import time (`path` and `os` for
 * resolution, `fs` and `@sasjs/utils/file` for the config lookup that a mock
 * never makes, because it hands the linter the default configuration).
 *
 * It is built from the installed @sasjs/api and @sasjs/lint on every mock
 * build, so the rules a client sees are the version the CLI resolved - a
 * committed bundle would be a second copy to drift.
 */
const LINT_BUNDLE_FILES: { [name: string]: string } = {
  'entry.js': [
    "import './process.js'",
    "import { createCodeService } from '@sasjs/api/code'",
    'globalThis.SASjsCode = { createCodeService }'
  ].join('\n'),
  'process.js': [
    '// the linter reads process.env for a default and process.cwd() for a root;',
    '// neither is a real lookup in a worker, and both are answered in one place',
    'if (typeof globalThis.process === "undefined")',
    '  globalThis.process = {',
    '    env: {},',
    '    platform: "browser",',
    '    cwd: () => "/",',
    '    versions: {},',
    '    argv: [],',
    '    version: "v0"',
    '  }'
  ].join('\n'),
  'fs.js': [
    'const unavailable = (name) => () => {',
    '  throw new Error(name + " is not available in the browser host")',
    '}',
    'module.exports = {',
    '  readFileSync: unavailable("readFileSync"),',
    '  writeFileSync: unavailable("writeFileSync"),',
    '  existsSync: () => false,',
    '  promises: {}',
    '}'
  ].join('\n'),
  'os.js': [
    'module.exports = {',
    '  homedir: () => "/",',
    '  platform: () => "browser",',
    '  tmpdir: () => "/tmp",',
    '  EOL: "\\n"',
    '}'
  ].join('\n'),
  'utils-file.js': [
    'const unavailable = (name) => async () => {',
    '  throw new Error(name + " is not available in the browser host")',
    '}',
    'module.exports = {',
    '  readFile: unavailable("readFile"),',
    '  writeFile: unavailable("writeFile"),',
    '  fileExists: async () => false,',
    '  listFilesInFolder: async () => []',
    '}'
  ].join('\n'),
  'path.js': String.raw`// the posix half of path, which is all the linter uses: the rules name files,
// and a mock hands the linter no folder to walk
const SEP = String.fromCharCode(92)
const clean = (value) =>
  String(value).split(SEP).join("/").replace(/\/+/g, "/")
const strip = (value) => clean(value).replace(/\/+$/, "")
const basename = (value) => strip(value).split("/").pop() || ""
const extname = (value) => {
  const base = basename(value)
  const dot = base.lastIndexOf(".")
  return dot > 0 ? base.slice(dot) : ""
}
const dirname = (value) => {
  const parts = clean(value).split("/")
  parts.pop()
  return parts.join("/") || "."
}
const join = (...parts) => clean(parts.filter(Boolean).join("/"))
module.exports = {
  sep: "/",
  delimiter: ":",
  basename,
  extname,
  dirname,
  join,
  resolve: (...parts) => clean(parts.filter(Boolean).join("/")),
  relative: (from, to) => clean(to).replace(clean(from) + "/", ""),
  isAbsolute: (value) => String(value).startsWith("/"),
  normalize: clean,
  parse: (value) => ({
    root: "",
    dir: dirname(value),
    base: basename(value),
    ext: extname(value),
    name: basename(value).slice(0, basename(value).length - extname(value).length)
  })
}`
}

/**
 * The `node_modules` the CLI's own dependency lives in.
 *
 * esbuild resolves a bare import from the entry file upwards, which is wrong for
 * a scratch entry outside the install: the walk would miss the installed
 * packages entirely. `nodePaths` states where to look instead, and it is taken
 * from `require.resolve` so it is the tree the CLI actually loaded from - a
 * hoisted install, a nested one, and a pnpm store symlink all answer with their
 * own location.
 */
const NODE_MODULES = (() => {
  const resolved = require.resolve('@sasjs/api')
  const marker = `${path.sep}node_modules${path.sep}`
  const index = resolved.lastIndexOf(marker)
  return index < 0 ? undefined : resolved.slice(0, index + marker.length - 1)
})()

/**
 * Builds `lint-browser.js` from the installed packages.
 *
 * The shim sources are written to the system temp folder, never beside this
 * module: an installed package can be read-only (a global install, a pnpm store
 * symlink, a container that builds as another user), and a build that writes
 * inside it fails with EACCES for exactly the users least able to diagnose it.
 * Resolution is kept by naming the CLI's `node_modules` through `nodePaths`.
 */
export const buildLintBundle = (destination: string) => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'sasjs-lint-'))
  try {
    for (const [name, contents] of Object.entries(LINT_BUNDLE_FILES))
      fs.writeFileSync(path.join(work, name), contents)
    esbuildSync({
      entryPoints: [path.join(work, 'entry.js')],
      bundle: true,
      platform: 'browser',
      format: 'iife',
      outfile: destination,
      nodePaths: NODE_MODULES ? [NODE_MODULES] : [],
      alias: {
        fs: path.join(work, 'fs.js'),
        path: path.join(work, 'path.js'),
        os: path.join(work, 'os.js'),
        '@sasjs/utils/file': path.join(work, 'utils-file.js')
      },
      logLevel: 'silent'
    })
  } catch (error: any) {
    throw new Error(
      `The browser lint bundle could not be built from @sasjs/api/code: ${
        (error && error.message) || error
      }`
    )
  } finally {
    fs.rmSync(work, { recursive: true, force: true })
  }
}

const listFiles = (folder: string, base = folder): string[] => {
  const entries = fs.readdirSync(folder, { withFileTypes: true })
  const files: string[] = []

  for (const entry of entries) {
    const absolute = path.join(folder, entry.name)
    if (entry.isDirectory()) files.push(...listFiles(absolute, base))
    else if (entry.isFile()) files.push(toPosix(path.relative(base, absolute)))
  }

  return files
}

const copyFolder = (from: string, to: string) => {
  fs.mkdirSync(to, { recursive: true })
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const source = path.join(from, entry.name)
    const target = path.join(to, entry.name)
    if (entry.isDirectory()) copyFolder(source, target)
    else fs.copyFileSync(source, target)
  }
}

/**
 * The drive seed comes from the COMPILE OUTPUT, not the sources: `sasjs
 * compile` copies every service folder into sasjsbuild/services and then
 * copies the sync folder's contents over the build folder root, so sasjsbuild
 * already holds exactly what a SASjs server would receive on its drive.
 *
 * Root-level files are skipped on purpose - those are the service pack (.sas),
 * its manifest (.json), the compile tree and the zip, none of which belong on
 * the drive.
 */
const PROGRAM_FOLDERS = ['services', 'jobs', 'tests']

/**
 * The bounds on what the browser drive seeds. A byte entry is carried as base64
 * in vfs-seed.json and held in the worker's memory, so a large artefact - an
 * export, a media file, a vendored archive - makes the generated site
 * unloadable: one file over the per-file bound, or enough files to pass the
 * total, is left off the drive and named in a warning, as every non-text file
 * was when the drive carried text only. Text has no bound: a program folder is
 * text by nature and the drive has always carried it.
 */
export const MAX_BINARY_SEED_BYTES = 10 * 1024 * 1024
export const MAX_SEED_BYTES = 25 * 1024 * 1024

/**
 * What the drive stores for a file: its text when the bytes survive a UTF-8
 * round trip, and behind the byte marker (BINARY_PREFIX in runtime-core.js)
 * otherwise. An archive, an image or an xlsx therefore lands on the drive as
 * bytes, so a service that downloads a project-supplied file finds it.
 *
 * Text that begins with U+0000 is escaped, because the runtime reads a leading
 * NUL as its own marker - the same rule the runtime applies to a write.
 */
const DRIVE_BINARY_PREFIX = '\u0000base64:'
const DRIVE_TEXT_PREFIX = '\u0000text:'

/**
 * The storage format these markers belong to, stamped into `vfs-seed.json` and
 * into the snapshot the site downloads. runtime-core.js holds its own copy (it
 * ships as a plain browser script) and refuses a file whose stamp it does not
 * speak, so the two cannot drift silently. Bump both numbers together when the
 * marker format changes.
 */
export const DRIVE_FORMAT = 1

type DriveFile = { contents: string; bytes?: number }

/** A byte count in MB, for the message that names a file too large to seed. */
const megabytes = (bytes: number) =>
  `${Math.round((bytes / 1024 / 1024) * 10) / 10} MB`

/**
 * The identity the site ships, and which file it came from.
 *
 * `mock-identity.json` beside the build wins, exactly as `mock-snapshot.json`
 * replaces the drive seed: one file, one load path, and which one wins is decided
 * here rather than at run time. Without it the package's demo fixture ships, so a
 * mock works with no configuration at all.
 *
 * The fixture is validated at build time - a malformed one stops the build while
 * the person who wrote it is watching, instead of producing a site that boots to
 * a refusal nobody can connect to a file.
 */
const readIdentityFixture = (
  buildFolder: string
): {
  fixture: typeof DEFAULT_IDENTITY
  source: 'default' | 'mock-identity.json'
} => {
  const file = path.join(buildFolder, 'mock-identity.json')
  if (!fs.existsSync(file))
    return { fixture: DEFAULT_IDENTITY, source: 'default' }

  let parsed: unknown
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (e: any) {
    throw new Error(`${file} is not valid JSON: ${e?.message || e}`)
  }

  try {
    return { fixture: parseIdentity(parsed), source: 'mock-identity.json' }
  } catch (e: any) {
    throw new Error(`${file} cannot be used: ${e?.message || e}`)
  }
}

const readDriveFile = (absolute: string): DriveFile => {
  const buffer = fs.readFileSync(absolute)
  const text = buffer.toString('utf8')
  if (!Buffer.from(text, 'utf8').equals(buffer))
    return {
      contents: DRIVE_BINARY_PREFIX + buffer.toString('base64'),
      // the raw size, which is what the seed bounds are measured in
      bytes: buffer.length
    }
  return {
    contents: text.startsWith('\u0000') ? DRIVE_TEXT_PREFIX + text : text
  }
}

const seedFromBuild = (
  buildFolder: string,
  appLoc: string,
  exclude: string[] = [],
  excludeFolders: string[] = []
) => {
  const files: { [path: string]: string } = {}
  const skipped: { key: string; bytes: number; limit: 'file' | 'total' }[] = []
  const driveBase = `/sasjs/drive/files${appLoc}`
  let seededBytes = 0

  // Every folder of the build goes on the drive, so a sync folder's content (a
  // licence store, for instance) survives as well as the program folders.
  const directories = fs
    .readdirSync(buildFolder, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())

  const candidates: { key: string; absolute: string }[] = []
  for (const entry of directories) {
    const folder = path.join(buildFolder, entry.name)
    if (excludeFolders.includes(path.resolve(folder))) continue
    for (const relative of listFiles(folder)) {
      const key = `${driveBase}/${entry.name}/${relative}`
      if (exclude.some((prefix) => key.startsWith(prefix))) continue
      candidates.push({ key, absolute: path.join(folder, relative) })
    }
  }

  // The budget is spent in path order, not in whatever order the folder listing
  // returns, so the same project yields the same drive - and the same warning -
  // on every machine and filesystem.
  candidates.sort((first, second) =>
    first.key < second.key ? -1 : first.key > second.key ? 1 : 0
  )

  for (const candidate of candidates) {
    const file = readDriveFile(candidate.absolute)
    // a byte entry counts against both bounds; a text entry counts against
    // neither, because the drive has always carried the program folders
    if (file.bytes !== undefined) {
      if (file.bytes > MAX_BINARY_SEED_BYTES) {
        skipped.push({ key: candidate.key, bytes: file.bytes, limit: 'file' })
        continue
      }
      if (seededBytes + file.bytes > MAX_SEED_BYTES) {
        skipped.push({ key: candidate.key, bytes: file.bytes, limit: 'total' })
        continue
      }
      seededBytes += file.bytes
    }
    files[candidate.key] = file.contents
  }

  return { files, skipped }
}

/**
 * `mockWebFolder` decides a folder that is deleted before it is written, so it
 * has to name a folder of its own. Anything that would delete the project, the
 * build output the drive is seeded from, or the web app it is copied from is
 * refused before a single file is touched.
 */
const assertSafeOutputFolder = (
  outputFolder: string,
  projectDir: string,
  buildFolder: string,
  webFolder: string
) => {
  const isSameOrChild = (parent: string, child: string) => {
    const relative = path.relative(parent, child)
    return (
      relative === '' ||
      (relative !== '..' &&
        !relative.startsWith('..' + path.sep) &&
        !path.isAbsolute(relative))
    )
  }
  const refusal = (why: string) =>
    new Error(
      `Refusing to write the mock site to ${outputFolder}: ${why}. ` +
        'Set streamConfig.mockWebFolder to a folder of its own, for example "sasjsbuild/mock".'
    )

  if (isSameOrChild(outputFolder, projectDir))
    throw refusal('that folder is the project folder or contains it')
  if (isSameOrChild(outputFolder, buildFolder))
    throw refusal('that folder holds the build output the drive is seeded from')
  if (isSameOrChild(outputFolder, webFolder))
    throw refusal('that folder holds the web app the site is copied from')
  if (isSameOrChild(webFolder, outputFolder))
    throw refusal(
      'that folder is inside the web app the site is copied from, so copying it would copy itself'
    )
  if (
    !isSameOrChild(projectDir, outputFolder) &&
    !isSameOrChild(buildFolder, outputFolder)
  )
    throw refusal('that folder is outside the project')
}

const countPrograms = (
  files: { [path: string]: string },
  extension: '.js' | '.sas'
) =>
  Object.keys(files).filter((key) => {
    const inProgramFolder = PROGRAM_FOLDERS.some((folder) =>
      key.includes(`/${folder}/`)
    )
    return inProgramFolder && key.toLowerCase().endsWith(extension)
  }).length

/** The script-tag attributes that change how an app's script runs. */
const REPLAYED_ATTRIBUTES: { [attribute: string]: string } = {
  type: 'type',
  id: 'id',
  crossorigin: 'crossOrigin',
  integrity: 'integrity',
  nomodule: 'noModule'
}

const parseAttributes = (source: string) => {
  const attributes: { [name: string]: string } = {}
  const pattern =
    /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g
  let match
  while ((match = pattern.exec(source))) {
    const value = match[2] ?? match[3] ?? match[4] ?? ''
    attributes[match[1].toLowerCase()] = value
  }
  return attributes
}

const escapeAttribute = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

/**
 * The boot loader is a FILE rather than an inline script: an app with a strict
 * Content-Security-Policy (`default-src 'self'`, no `unsafe-inline`) refuses an
 * inline one, and the builder cannot add a hash or nonce to a policy it does
 * not own.
 *
 * The app's script tags travel to it in `data-scripts`, in document order. Any
 * number of tags works - one bundle, or several plain scripts a page loads in
 * order, plus the inline snippets some pages use to set up a global before the
 * bundle runs - so the host does not dictate how the app is built.
 */
const bootTag = (
  scripts: { [key: string]: string }[],
  version: string,
  basePath = ''
) =>
  `<script src="${
    basePath ? `${basePath}/host/boot.js` : 'host/boot.js'
  }?v=${version}" data-scripts='${escapeAttribute(
    JSON.stringify(scripts)
  )}'></script>`

/**
 * Script types the browser executes. Anything else (`application/ld+json`, a
 * template) is data the page keeps for later, so it stays where it is.
 */
const EXECUTABLE_TYPES = [
  '',
  'module',
  'text/javascript',
  'application/javascript'
]

/**
 * The folder the site is published under, with a leading slash and no trailing
 * one.
 *
 * Empty for the origin root, which is the ordinary case. A host that serves the
 * demonstration site beside its documentation (a GitHub Pages site whose root is
 * the docs) names the folder here, and every path the build emits follows it.
 *
 * The shapes the released build accepts keep working - a bare `demo`, a leading
 * or trailing slash, surrounding space - and are normalised rather than
 * refused, because a `fix(mock)` release must not fail a build that passes
 * today. The sasjsconfig schema states the canonical form; this only rejects
 * what could never have worked, a segment that is `.`, `..` or empty.
 */
const normaliseBasePath = (value?: string) => {
  if (!value) return ''

  const segments = String(value)
    .trim()
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
    .split('/')

  if (
    !segments.length ||
    segments.some(
      (segment) =>
        !segment ||
        segment === '.' ||
        segment === '..' ||
        !/^[A-Za-z0-9._~-]+$/.test(segment)
    )
  )
    throw new Error(
      `mockWebBasePath is not a folder path: ${JSON.stringify(
        value
      )}. Use a path such as "/demo", or leave it unset for the origin root.`
    )

  return '/' + segments.join('/')
}

/**
 * Tells the interface that this page is answered by the browser host.
 *
 * A mock site is the server's own interface running against a service worker,
 * and nothing in the document said so: the API answers the same routes, the same
 * mode and the same run times a desktop server does, so an interface could not
 * tell a visitor what they were looking at. sasjs/server reads the tag and, where
 * it is absent, knows the server answered the page.
 *
 * The insertion is reported when the page has no `<head>`, the way the other two
 * rewrites report markup they could not find - silently leaving the tag off a
 * page the browser host cannot mark is what the reader of the absence rule would
 * misread as "a server answered this". The check for an existing tag is scoped
 * to the head, because a page may mention the tag in a script or a template
 * without carrying it, and a document-wide test would then insert nothing.
 */
const HOST_TAG = '<meta name="sasjs-host" content="browser" />'
const HOST_TAG_PATTERN = /<meta\s+name=["']sasjs-host["']/i

const markBrowserHost = (html: string, warnings: string[]) => {
  const head = /<head(\s[^>]*)?>/i.exec(html)
  if (!head) {
    warnings.push(
      'no <head> element found - the sasjs-host tag was not added, so the page will read as server-answered'
    )
    return html
  }
  const start = head.index + head[0].length
  const close = html.toLowerCase().indexOf('</head>', start)
  const inHead = close < 0 ? html.slice(start) : html.slice(start, close)
  if (HOST_TAG_PATTERN.test(inHead)) return html
  return html.slice(0, start) + HOST_TAG + html.slice(start)
}

/**
 * Each app script's URL carries a hash of the script's own contents.
 *
 * A static host caches an asset for as long as it says to, and GitHub Pages says
 * two hours - while the app's bundle name never changes from one build to the
 * next. So a publish that changes only the app reuses the previous URL, and a
 * visitor inside that window runs the previous build against the new page: the
 * screens the new build adds simply never appear, and the ones it removed keep
 * working. Only the host's own files were versioned before (`?v=` on boot.js and
 * the worker's imports), and those change with the CLI, not with the app.
 *
 * A src that names no file in the output is left alone: a page may load a
 * script from somewhere this build does not own, and guessing a version for it
 * would break it.
 *
 * The tags in the page are all this covers. A chunk the entry point loads later
 * - `import('./chunk.js')`, a lazy route - keeps its own URL and is cached for
 * the same window, because the request for it is made by the bundle's runtime
 * and never passes through this file. Versioning those would mean rewriting the
 * chunk map inside the bundle, which is the bundler's business, not the host's;
 * a page whose chunks matter more than its entry should name them in the page,
 * where this does reach them.
 */
const versionScripts = (
  scripts: { [key: string]: string }[],
  outputFolder: string
) =>
  scripts.map((script) => {
    const src = script.src

    if (!src) return script

    const [pathname, query] = src.split('?')
    const file = path.join(outputFolder, pathname.replace(/^(\.\/|\/)/, ''))

    if (!fs.existsSync(file)) return script

    const hash = createHash('md5')
      .update(fs.readFileSync(file))
      .digest('hex')
      .slice(0, 10)

    return Object.assign({}, script, {
      src: `${pathname}?v=${hash}${query ? `&${query}` : ''}`
    })
  })

/**
 * Points the app at its own origin and replaces its script tags with the boot
 * loader. Both changes are reported when the expected markup is absent, rather
 * than producing a site that silently talks to a real server.
 */
const patchIndexHtml = (
  html: string,
  version: string,
  basePath = '',
  outputFolder = ''
) => {
  const warnings: string[] = []
  let patched = html

  patched = markBrowserHost(patched, warnings)

  if (/<sasjs[^>]*>/i.test(patched)) {
    // the app talks to the origin root by default; on a site published under a
    // folder it has to name that folder, or its API calls leave the worker's
    // scope and meet the static host
    patched = patched.replace(
      /(<sasjs[^>]*?)\sserverurl="[^"]*"/i,
      `$1 serverurl="${basePath}"`
    )
    patched = patched.replace(
      /(<sasjs[^>]*?)\sloginmechanism="[^"]*"/i,
      '$1 loginmechanism="Default"'
    )
  } else {
    warnings.push(
      'no <sasjs> element found - check the adapter configuration manually'
    )
  }

  const scripts: { [key: string]: string }[] = []
  const tagPattern = /<script\b([^>]*)>([\s\S]*?)<\/script>[ \t]*\r?\n?/gi

  patched = patched.replace(
    tagPattern,
    (tag: string, source: string, body: string) => {
      const attributes = parseAttributes(source)
      const type = (attributes.type || '').trim().toLowerCase()
      const inlined = !attributes.src

      // data blocks stay in the page; they are not scripts to replay
      if (!EXECUTABLE_TYPES.includes(type)) return tag

      const spec: { [key: string]: string } = inlined
        ? {}
        : { src: attributes.src }
      if (inlined) {
        const code = body.trim()
        // an empty inline tag (a placeholder, or a commented-out block) is not
        // worth a round trip
        if (!code) return ''
        spec.code = code
      }
      for (const attribute of Object.keys(REPLAYED_ATTRIBUTES)) {
        if (attributes[attribute] === undefined) continue
        if (attribute === 'type' && !attributes.type) continue
        const name = REPLAYED_ATTRIBUTES[attribute]
        spec[name] = attribute === 'nomodule' ? 'true' : attributes[attribute]
      }
      scripts.push(spec)
      return ''
    }
  )

  if (scripts.length) {
    const versioned = outputFolder
      ? versionScripts(scripts, outputFolder)
      : scripts
    const tag = bootTag(versioned, version, basePath)
    patched = /<\/body>/i.test(patched)
      ? patched.replace(/<\/body>/i, `${tag}\n</body>`)
      : patched + tag
  } else {
    warnings.push('no script tags found - the mock loader was not installed')
  }

  return { patched, warnings }
}

/**
 * Builds a static site that runs the project's JS services (its mocks) in the
 * browser, so a frontend can be tested with no server and no SAS.
 *
 * The output is an ordinary folder of static files: serve it over http(s) and
 * the app behaves as though it were talking to a single-user SASjs server. The
 * work happens in a service worker, so every request is still a real request -
 * visible in DevTools > Network, marked "(from ServiceWorker)" - and the drive
 * it writes to is persisted in IndexedDB, so refreshes keep their state.
 *
 * Everything comes from the target: appLoc, streamConfig.mockWebFolder for the
 * output, streamConfig.webSourcePath for the built app, and the compile output
 * for the drive.
 */
export async function buildMockSite(target: Target): Promise<MockSiteResult> {
  const projectDir = process.projectDir || process.cwd()
  const appLocRaw = (target as any).appLoc
  if (!appLocRaw) {
    throw new Error(
      'No appLoc. Set appLoc on the target - it has to match the appLoc the app is built with.'
    )
  }
  const appLoc = '/' + appLocRaw.replace(/^\/+/, '').replace(/\/+$/, '')

  const buildFolder =
    process.sasjsConstants.buildDestinationFolder ||
    path.join(projectDir, 'sasjsbuild')

  if (!(await folderExists(buildFolder))) {
    throw new Error(
      `Build folder not found: ${buildFolder}. Run \`sasjs compile\` first.`
    )
  }

  const basePath = normaliseBasePath(target.streamConfig?.mockWebBasePath)

  const webSourceRaw = target.streamConfig?.webSourcePath
  if (!webSourceRaw) {
    throw new Error(
      'No built web app. Set streamConfig.webSourcePath on the target (for example ./client/dist), and build the frontend first.'
    )
  }
  const webFolder = path.resolve(projectDir, webSourceRaw)
  if (!(await folderExists(webFolder))) {
    throw new Error(
      `Web source folder not found: ${webFolder}. Check streamConfig.webSourcePath - build the frontend first.`
    )
  }
  if (!fs.existsSync(path.join(webFolder, 'index.html'))) {
    throw new Error(
      `${webFolder} does not contain an index.html - is streamConfig.webSourcePath pointing at the built app?`
    )
  }

  const outputFolder = target.streamConfig?.mockWebFolder
    ? path.resolve(projectDir, target.streamConfig.mockWebFolder)
    : path.join(buildFolder, 'mock')

  assertSafeOutputFolder(outputFolder, projectDir, buildFolder, webFolder)

  // Read the drive before anything is written or removed: an unusable target
  // (SAS services, unreadable build folder) then leaves the previous site in
  // place instead of destroying it and failing.
  // A streamed app is copied into the build as services/<streamWebFolder>. It
  // is already served as the site itself, so it does not belong on the drive.
  const streamConfig = target.streamConfig
  const excluded: string[] = []
  // streamWebFolder is defaulted by the config validator, so a streamed app
  // always names its folder.
  if (streamConfig?.streamWeb && streamConfig.streamWebFolder) {
    excluded.push(
      `/sasjs/drive/files${appLoc}/services/${streamConfig.streamWebFolder}/`
    )
  }

  // A previous site may sit inside the build folder; leaving it out of the seed
  // keeps the old site out of the new drive.
  const { files: seed, skipped } = seedFromBuild(
    buildFolder,
    appLoc,
    excluded,
    [outputFolder]
  )
  const jsPrograms = countPrograms(seed, '.js')
  const sasPrograms = countPrograms(seed, '.sas')
  const driveEntries = Object.keys(seed).length

  // A build whose services are SAS is still a site worth having, and it is built:
  // the programs are seeded on the drive, where a visitor can open them in Studio
  // and read them - which is how a deployment's own backend code is inspected
  // without a SAS licence and without a login. What they cannot do is run here,
  // so the build says so rather than letting a Run button be the surprise.
  if (jsPrograms === 0 && sasPrograms > 0) {
    process.logger?.warn(
      `${sasPrograms} SAS program(s) and no JavaScript in ${buildFolder}: they are placed on the drive to read, and cannot run in a browser.`
    )
  }

  // No PROGRAMS is a different thing again: a compile that produced nothing, or
  // a stale sasjsbuild from an unrelated command - `sasjs doc` leaves a folder
  // behind that is not a program folder but does reach the drive, so the count
  // that decides this is of programs, not of files.
  if (jsPrograms + sasPrograms === 0) {
    process.logger?.warn(
      `No compiled programs in ${buildFolder}: this site ships with an empty drive. ` +
        'That is expected for an interface with no services; for anything else, check that compile wrote the target.'
    )
  }

  // The package supplies the drive rules the worker answers with, so an install
  // without its browser build is a build that cannot run. Checked here, with the
  // other refusals, so a missing dependency leaves the previous site in place -
  // and named, rather than a bare ENOENT from a path three levels up.
  if (!fs.existsSync(API_BROWSER_BUILD)) {
    throw new Error(
      `The @sasjs/api browser build is missing: expected it at ${API_BROWSER_BUILD}. ` +
        'Reinstall dependencies (npm ci) so the package that ships the drive rules is present, ' +
        'or check that @sasjs/api still publishes build/browser.js.'
    )
  }

  if (skipped.length) {
    process.logger?.warn(
      `Left ${skipped.length} file(s) off the mock drive, over the ${megabytes(
        MAX_BINARY_SEED_BYTES
      )} per-file or ${megabytes(
        MAX_SEED_BYTES
      )} total the browser build seeds: ` +
        `${skipped
          .slice(0, 3)
          .map(
            (file) =>
              `${file.key} (${megabytes(file.bytes)}, ${
                file.limit === 'file'
                  ? 'over the per-file limit'
                  : 'over the drive budget'
              })`
          )
          .join(', ')}${skipped.length > 3 ? ', ...' : ''}`
    )
  }

  // Read and validate the identity before the previous site is expendable: a
  // malformed `mock-identity.json` must cost the build, not the site that was
  // already there.
  const identity = readIdentityFixture(buildFolder)

  // Only now is the previous site expendable.
  fs.rmSync(outputFolder, { recursive: true, force: true })
  fs.mkdirSync(outputFolder, { recursive: true })

  // 1. the app
  copyFolder(webFolder, outputFolder)
  const webFileCount = listFiles(outputFolder).length

  // 2. the runtime host
  const hostFolder = path.join(outputFolder, 'host')
  fs.mkdirSync(hostFolder, { recursive: true })
  for (const asset of [
    'md5.js',
    'runtime-core.js',
    'persist.js',
    'intercept.js',
    'boot.js'
  ]) {
    fs.copyFileSync(
      path.join(ASSETS_FOLDER, asset),
      path.join(hostFolder, asset)
    )
  }
  fs.copyFileSync(API_BROWSER_BUILD, path.join(hostFolder, 'api-browser.js'))
  // 2. the linter, bundled from the installed packages so the code routes answer
  // with the rules this CLI resolved rather than a second implementation
  await buildLintBundle(path.join(hostFolder, 'lint-browser.js'))
  // sw.js sits at the site root: a worker can only control the folder it is
  // served from, and the app has to be controlled from /
  fs.copyFileSync(
    path.join(ASSETS_FOLDER, 'sw.js'),
    path.join(outputFolder, 'sw.js')
  )

  // 2a. the webout() block, generated once with sentinels that runtime-core.js
  // fills in per run. It is the same text the server emits, from @sasjs/utils,
  // so a service cannot behave differently in a mock build.
  fs.writeFileSync(
    path.join(hostFolder, 'webout-prelude.json'),
    JSON.stringify({
      sentinels: WEBOUT_SENTINELS,
      template: getWeboutPrelude({
        weboutPath: WEBOUT_SENTINELS.weboutPath,
        headersPath: WEBOUT_SENTINELS.headersPath,
        program: WEBOUT_SENTINELS.program,
        debug: WEBOUT_SENTINELS.debug,
        username: WEBOUT_SENTINELS.username,
        userId: WEBOUT_SENTINELS.userId,
        apiServerUrl: WEBOUT_SENTINELS.apiServerUrl
      })
    })
  )

  // 2a-ii. the identity the site signs in with: the fixture the build chose, in
  // the one place the runtime reads it. `window.SASjsMock.as()` and a reset both
  // come back to this file, and the page stores the store's snapshot beside the
  // drive so an account created through the routes survives a reload.
  fs.writeFileSync(
    path.join(hostFolder, 'identity.json'),
    JSON.stringify(identity.fixture, null, 2)
  )

  // 2b. cache busting. Static hosts keep these files for a long time and their
  // names never change, so a returning visitor would otherwise run the host
  // code from the previous build - including the worker, which imports
  // runtime-core.js through the same cache.
  const hostVersion = createHash('md5')
    .update(
      [
        'runtime-core.js',
        'persist.js',
        'intercept.js',
        'boot.js',
        'api-browser.js',
        'lint-browser.js',
        'webout-prelude.json',
        'identity.json'
      ]
        .map((asset) => fs.readFileSync(path.join(hostFolder, asset)))
        .reduce((all, buf) => Buffer.concat([all, buf]), Buffer.alloc(0))
    )
    .digest('hex')
    .slice(0, 10)

  // The identity of this build's drive: the seed itself. The host files are
  // re-fetched on every load, so a change to them needs no re-seed; a change to
  // the seed does, because the drive a visitor already has was written by the
  // seed of the build before this one. A page that finds a drive stamped with
  // another value drops it and takes this build's seed.
  const buildStamp = createHash('md5')
    .update(
      JSON.stringify(
        Object.keys(seed)
          .sort()
          .map((key) => [key, seed[key]])
      )
    )
    .digest('hex')
    .slice(0, 10)

  const swPath = path.join(outputFolder, 'sw.js')
  fs.writeFileSync(
    swPath,
    fs
      .readFileSync(swPath, 'utf8')
      .replace(
        "importScripts('host/runtime-core.js')",
        `importScripts('host/runtime-core.js?v=${hostVersion}')`
      )
      .replace(
        "importScripts('host/api-browser.js')",
        `importScripts('host/api-browser.js?v=${hostVersion}')`
      )
      .replace(
        "importScripts('host/lint-browser.js')",
        `importScripts('host/lint-browser.js?v=${hostVersion}')`
      )
  )

  // 2c. a captured drive, if the project keeps one. This is how a site ships
  // with data already in it: seed once in a browser, export the drive with
  // window.SASjsMock.download(), and place the file here.
  const snapshotSource = path.join(buildFolder, 'mock-snapshot.json')
  const hasSnapshot = fs.existsSync(snapshotSource)
  if (hasSnapshot) {
    fs.copyFileSync(snapshotSource, path.join(hostFolder, 'vfs-snapshot.json'))
  }

  // 2d. a recorded SAS session, if the project ships one. A browser has no SAS
  // binary, so a .sas program the recording names is answered with it - the log,
  // listing and webout of a session already run - and every program it does not
  // name is refused as before. It is data in the project, not a behaviour of the
  // host: nothing is invented for a project that does not ship the file.
  const transcriptSource = path.join(buildFolder, 'sas-transcript.json')
  const hasTranscript = fs.existsSync(transcriptSource)
  if (hasTranscript)
    fs.copyFileSync(
      transcriptSource,
      path.join(hostFolder, 'sas-transcript.json')
    )

  // 3. the drive, laid out from the compile output
  fs.writeFileSync(
    path.join(hostFolder, 'vfs-seed.json'),
    JSON.stringify({ format: DRIVE_FORMAT, files: seed })
  )

  fs.writeFileSync(
    path.join(hostFolder, 'mock-config.json'),
    JSON.stringify(
      {
        appLoc,
        seedPath: 'host/vfs-seed.json',
        driveEntries,
        jsPrograms,
        programFolders: PROGRAM_FOLDERS,
        snapshot: hasSnapshot,
        sasTranscript: hasTranscript,
        identity: identity.source,
        buildStamp,
        builtAt: new Date().toISOString()
      },
      null,
      2
    )
  )

  // 4. point the app at itself
  const indexPath = path.join(outputFolder, 'index.html')
  const { patched, warnings } = patchIndexHtml(
    fs.readFileSync(indexPath, 'utf8'),
    hostVersion,
    basePath,
    outputFolder
  )
  fs.writeFileSync(indexPath, patched)
  warnings.forEach((warning) => process.logger?.warn(warning))

  return {
    outputFolder,
    appLoc,
    driveEntries,
    jsPrograms,
    webFileCount,
    snapshot: hasSnapshot,
    sasTranscript: hasTranscript,
    identitySource: identity.source
  }
}
