import { createHash } from 'crypto'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { buildSync as esbuildSync } from 'esbuild'
import { JSDOM } from 'jsdom'
import { DEFAULT_IDENTITY, parseIdentity, ROUTES } from '@sasjs/api'
import { folderExists, getWeboutPrelude, Target } from '@sasjs/utils'

// The folder `sasjs build` keeps the published frontend in, spelled here rather
// than imported: this file is transpiled on its own by
// `spec/pnpmResolution.spec.ts`, which resolves the CLI's PACKAGES from a fake
// pnpm layout, so a relative import here has no file to resolve. It is not
// deployment content and must not reach this site's drive.
const PUBLISH_FOLDER = 'publish'

// The source offsets used from jsdom's nodeLocation result.
type SourceRange = { startOffset: number; endOffset: number }
type ElementLocation = SourceRange & {
  attrs?: { [name: string]: SourceRange }
  startTag?: SourceRange
  endTag?: SourceRange
}

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
  /**
   * How many pieces the captured drive ships in: the boot shard plus one per
   * large folder or file. Zero when the site ships no snapshot.
   */
  snapshotShards: number
  /** True when the site carries the API console at <base>/api-console/. */
  apiConsole: boolean
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

const LANGUAGE_ROOT = path.resolve(
  path.dirname(require.resolve('@sasjs/sas-language/server/node')),
  '..',
  '..'
)
const LANGUAGE_VERSION: string = JSON.parse(
  fs.readFileSync(path.join(LANGUAGE_ROOT, '..', '..', 'package.json'), 'utf8')
).version

const toPosix = (value: string) => value.split(path.sep).join('/')

/**
 * The linter, as a service worker can run it.
 *
 * `@sasjs/api/code` is a node-only entry because `@sasjs/lint` resolves its
 * configuration by walking a filesystem - but the linter's core (`lintText`,
 * `formatText`) reads only the text it is given and the configuration it is
 * passed, so the two can run anywhere the module graph can be built. This
 * bundle is that graph: the package's own code service, the configuration class
 * a host builds from its own rules file, the linter behind both, and shims for
 * the four node modules reached at import time (`path` and `os` for resolution,
 * `fs` and `@sasjs/utils/file` for the linter's own filesystem lookup, which
 * this host never makes - it hands the routes the rules it read from the drive).
 *
 * It is built from the installed @sasjs/api and @sasjs/lint on every mock
 * build, so the rules a client sees are the version the CLI resolved - a
 * committed bundle would be a second copy to drift.
 */
const LINT_BUNDLE_FILES: { [name: string]: string } = {
  'entry.js': [
    "import './process.js'",
    "import { createCodeService, LintConfig } from '@sasjs/api/code'",
    "import { formatText } from '@sasjs/sas-language/format'",
    `globalThis.SASjsCode = { createCodeService, LintConfig, formatText, dataPath: 'sas-language/${LANGUAGE_VERSION}/' }`
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
 * Resolve the scratch entry's direct imports from the CLI's own module search
 * paths. An API dependency's real path may be in a separate pnpm store folder,
 * whose node_modules does not contain the CLI's other direct dependencies.
 * esbuild still resolves each package's transitive imports from that package.
 */
const NODE_MODULES = module.paths

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
      define: { global: 'globalThis' },
      format: 'iife',
      outfile: destination,
      nodePaths: NODE_MODULES,
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
    // the published frontend is an input to the pack, not content of the
    // deployment this site emulates; a mock site is not drive content either
    if (entry.name === PUBLISH_FOLDER) continue
    if (isMockSiteFolder(folder)) continue
    if (excludeFolders.includes(path.resolve(folder))) continue
    for (const relative of listFiles(folder)) {
      const key = `${driveBase}/${entry.name}/${relative}`
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
 * Whether one folder is the other, or sits inside it.
 *
 * `path.relative(parent, child)` answers `''` for the folder itself, `..` for the
 * parent and a `..`-prefixed path for a sibling - none of which is "inside".
 * Forgetting the `..` case treats a folder's PARENT as contained in it, which is
 * how a mock path that resolves to the project (`mockWebFolder: "."`) once
 * excluded every deployment folder beneath the build.
 *
 * Exported because `deploymentTree` asks the same question of the folders it
 * keeps out of the pack; one implementation is what keeps the two answers equal.
 */
export const isSameOrChild = (parent: string, child: string): boolean => {
  const relative = path.relative(parent, child)

  return (
    relative === '' ||
    (relative !== '..' &&
      !relative.startsWith('..' + path.sep) &&
      !path.isAbsolute(relative))
  )
}

/**
 * The folders inside the build that the CLI writes itself.
 *
 * A mock site deletes the folder it is written to, so these are the ones it may
 * not be pointed at - the deployment's own folders and the published frontend.
 * Read from the constants rather than spelled out: a new folder the build writes
 * should not silently become free space for a mock.
 */
const protectedBuildFolders = (target: Target): string[] => {
  const constants = process.sasjsConstants
  const buildFolder = constants.buildDestinationFolder
  const folders = [
    constants.buildDestinationServicesFolder,
    constants.buildDestinationJobsFolder,
    constants.buildDestinationTestFolder,
    constants.buildDestinationDbFolder,
    constants.buildDestinationDocsFolder,
    path.join(buildFolder, 'publish')
  ]

  if (target.streamConfig?.streamWeb && target.streamConfig.streamWebFolder)
    folders.push(path.join(buildFolder, target.streamConfig.streamWebFolder))

  return folders.filter(Boolean)
}

/**
 * `mockWebFolder` decides a folder that is deleted before it is written, so it
 * has to name a folder of its own. Anything that would delete the project, the
 * build output the drive is seeded from, the folders the CLI writes into it, or
 * the web app it is copied from is refused before a single file is touched.
 *
 * A folder inside the build is allowed (an explicit `mockWebFolder` is honoured),
 * but only one that does not overlap what the build wrote: pointing it at
 * `sasjsbuild/services` or the streamed assets would delete the deployment and
 * replace it with a site the pack then excludes.
 */
const assertSafeOutputFolder = (
  outputFolder: string,
  projectDir: string,
  buildFolder: string,
  webFolder: string,
  protectedFolders: string[] = []
) => {
  const refusal = (why: string) =>
    new Error(
      `Refusing to write the mock site to ${outputFolder}: ${why}. ` +
        'Set streamConfig.mockWebFolder to a folder of its own, for example "sasjsresults/mock".'
    )

  if (isSameOrChild(outputFolder, projectDir))
    throw refusal('that folder is the project folder or contains it')
  if (outputFolder === buildFolder)
    throw refusal('that folder holds the build output the drive is seeded from')
  if (
    protectedFolders.some(
      (folder) =>
        isSameOrChild(outputFolder, folder) ||
        isSameOrChild(folder, outputFolder)
    )
  )
    throw refusal(
      "that folder is one the build writes - the deployment folders and the published frontend are not the mock site's to replace"
    )
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

/**
 * The size at which a captured file is fetched on its own rather than with its
 * folder.
 *
 * A shard is a download the visitor waits for, and an app's folder holds both
 * its bundles and the small files a listing shows - its logo, a config. Splitting
 * on size keeps one from dragging the other: the tile asks for the folder's small
 * files, the app's own page asks for the bundle.
 */
export const SHARD_FILE_BYTES = 256 * 1024

/**
 * The size below which a folder's files ride in the boot shard.
 *
 * The boot shard is fetched before the first page renders, so it is paid by every
 * visit. Folders under this size are cheaper there than as a request of their
 * own; folders over it are only fetched when something reads them.
 */
export const SHARD_GROUP_BYTES = 64 * 1024

/** The folder a captured path is grouped under: its first three segments. */
const shardFolderFor = (filePath: string) => {
  const prefix = '/sasjs/drive/files/'
  if (!filePath.startsWith(prefix)) return path.dirname(filePath)
  const parts = filePath.slice(prefix.length).split('/')
  // a file at the drive root groups with the other root files, which is where
  // the index, the linter rules and a project's configs live
  return (
    prefix +
    parts
      .slice(0, Math.max(0, parts.length - 1))
      .slice(0, 3)
      .join('/')
  )
}

/**
 * Splits a captured drive into a boot shard and the pieces fetched on demand.
 *
 * A site that ships its whole drive as one file makes every visitor download all
 * of it before the first page renders - on a demonstration site that is every
 * app's bundle, behind a list of tiles that names them. The split is by what a
 * page reads, not by what the drive holds:
 *
 * - a file at or over `SHARD_FILE_BYTES` gets a shard of its own;
 * - the rest are grouped by folder, and a folder under `SHARD_GROUP_BYTES` joins
 *   the boot shard (id 0), so no visit pays a round trip for a logo;
 * - everything over it becomes a shard, fetched when a path in it is read.
 *
 * The index carries every path with its shard and byte count, so a listing, a
 * stat and an existence check answer for the whole drive with nothing fetched.
 */
const shardSnapshot = (files: { [path: string]: string }) => {
  const paths = Object.keys(files).sort()
  const bytesOf = (filePath: string) =>
    Buffer.byteLength(String(files[filePath]))

  const groups = new Map<string, string[]>()
  for (const filePath of paths) {
    const big = bytesOf(filePath) >= SHARD_FILE_BYTES
    const key = big ? `file:${filePath}` : `dir:${shardFolderFor(filePath)}`
    groups.set(key, (groups.get(key) || []).concat(filePath))
  }

  const shards: { paths: string[]; bytes: number }[] = [{ paths: [], bytes: 0 }]
  for (const key of [...groups.keys()].sort()) {
    const members = groups.get(key) as string[]
    const bytes = members.reduce(
      (total, filePath) => total + bytesOf(filePath),
      0
    )
    const ridesInBoot = key.startsWith('dir:') && bytes <= SHARD_GROUP_BYTES
    if (ridesInBoot) {
      shards[0].paths.push(...members)
      shards[0].bytes += bytes
      continue
    }
    shards.push({ paths: members, bytes })
  }

  const entries: { [path: string]: { shard: number; bytes: number } } = {}
  shards.forEach((shard, id) => {
    for (const filePath of shard.paths) {
      entries[filePath] = { shard: id, bytes: bytesOf(filePath) }
    }
  })

  return {
    index: {
      format: DRIVE_FORMAT,
      sharded: true,
      boot: 0,
      files: paths.length,
      entries,
      shards: shards.map((shard, id) => ({
        id,
        file: `host/vfs-snapshot-${id}.json`,
        bytes: shard.bytes,
        files: shard.paths.length
      }))
    },
    shards: shards.map((shard, id) => ({
      id,
      file: `vfs-snapshot-${id}.json`,
      bytes: shard.bytes,
      files: Object.fromEntries(
        shard.paths.map((filePath) => [filePath, files[filePath]])
      )
    }))
  }
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

/** The host runs as a parser-blocking external script, including under strict CSP. */
const bootTag = (version: string, basePath = '') =>
  `<script src="${basePath}/host/boot.js?v=${version}"></script>`

// Install before app scripts. The observer stamps the config at a microtask
// checkpoint before async app tasks and subsequent parser-executed scripts.
const MOUNT_CONFIG_SCRIPT = `(function () {
  var base = new URL('../', document.currentScript.src)
  function stamp() {
    var config = document.querySelector('sasjs')
    if (!config || !config.hasAttribute('serverurl')) return false
    config.setAttribute('serverurl', base.origin + base.pathname.slice(0, -1))
    return true
  }
  if (!stamp() && !window.__sasjsMountObserver) {
    var observer = new MutationObserver(function () {
      if (stamp()) observer.disconnect()
    })
    window.__sasjsMountObserver = observer
    observer.observe(document, { childList: true, subtree: true })
  }
})()\n`
const MOUNT_CONFIG_VERSION = createHash('md5')
  .update(MOUNT_CONFIG_SCRIPT)
  .digest('hex')
  .slice(0, 10)

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

    // A `?v=<contents>` URL is safe for an asset that pins a subresource-integrity
    // hash: SRI digests the fetched BYTES, not the URL, so the hash still matches.
    // The version is what stops a stale copy being served at all - a changed file
    // gets a new URL, and an unchanged one is byte-identical to what the hash was
    // computed from.
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(src)) return script
    const hashAt = src.indexOf('#')
    const fragment = hashAt < 0 ? '' : src.slice(hashAt)
    const beforeFragment = hashAt < 0 ? src : src.slice(0, hashAt)
    const queryAt = beforeFragment.indexOf('?')
    const pathname =
      queryAt < 0 ? beforeFragment : beforeFragment.slice(0, queryAt)
    const query = queryAt < 0 ? '' : beforeFragment.slice(queryAt + 1)
    const file = path.join(outputFolder, pathname.replace(/^(\.\/|\/)/, ''))
    const relative = path.relative(outputFolder, file)
    if (
      !relative ||
      relative === '..' ||
      relative.startsWith('..' + path.sep) ||
      path.isAbsolute(relative)
    )
      return script

    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return script

    const hash = createHash('md5')
      .update(fs.readFileSync(file))
      .digest('hex')
      .slice(0, 10)

    return Object.assign({}, script, {
      src: `${pathname}?v=${hash}${query ? `&${query}` : ''}${fragment}`
    })
  })

/**
 * Points the app at its own origin and inserts the host before app scripts.
 * Missing configuration or head markup is reported to the caller.
 */
const patchIndexHtml = (
  html: string,
  version: string,
  basePath = '',
  outputFolder = '',
  serverType?: string,
  appLoc?: string
) => {
  const warnings: string[] = []
  let patched = html

  patched = markBrowserHost(patched, warnings)

  // Parse for locations but edit the original markup: serialising a DOM changes
  // attributes and inline text. The original tags remain parser-inserted.
  const dom = new JSDOM(patched, { includeNodeLocations: true })
  const document = dom.window.document
  const edits: { start: number; end: number; text: string }[] = []
  const config = document.querySelector('sasjs')
  if (config) {
    const location = dom.nodeLocation(config) as ElementLocation | null

    const values: { [name: string]: string | undefined } = {
      serverurl: basePath,
      loginmechanism: 'Default',
      servertype: serverType,
      apploc: appLoc
    }
    const missing: string[] = []
    for (const [name, value] of Object.entries(values)) {
      const attr = location?.attrs?.[name]
      if (value === undefined) continue
      const escaped = value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
      if (!attr) {
        missing.push(name)
        continue
      }
      edits.push({
        start: attr.startOffset,
        end: attr.endOffset,
        text: `${name}="${escaped}"`
      })
    }
    if (missing.length && location?.startTag) {
      const start = location.startTag.startOffset
      const tagName = /^<[^\s/>]+/.exec(patched.slice(start))
      if (tagName) {
        const at = start + tagName[0].length
        const attrs = missing
          .map((name) => {
            const value = values[name]!.replace(/&/g, '&amp;').replace(
              /"/g,
              '&quot;'
            )
            return ` ${name}="${value}"`
          })
          .join('')
        edits.push({ start: at, end: at, text: attrs })
      }
      warnings.push(
        `<sasjs> was missing ${missing.join(', ')}; mock attributes were added, but an app that ignores them may use incompatible adapter defaults - check its configuration manually`
      )
    }
  } else {
    warnings.push(
      'no <sasjs> element found - check the adapter configuration manually'
    )
  }
  const scripts = Array.from(document.querySelectorAll('script'))
  if (outputFolder) {
    for (const script of scripts) {
      const src = script.getAttribute('src')
      const location = dom.nodeLocation(script) as
        ElementLocation | null | undefined
      const attr = location?.attrs?.src
      if (!src || !attr) continue
      const [versioned] = versionScripts([{ src }], outputFolder)
      if (versioned.src === src) continue
      const hash = /[?]v=([0-9a-f]{10})/.exec(versioned.src)?.[1]
      if (!hash) continue
      const original = patched.slice(attr.startOffset, attr.endOffset)
      // Only the src value is edited, even if another attribute contains it.
      const updated = original.replace(
        /^(\s*src\s*=\s*)("[^"]*"|'[^']*'|[^\s>]+)/i,
        (_match, prefix: string, value: string) => {
          const quote = value[0] === '"' || value[0] === "'" ? value[0] : ''
          const raw = quote ? value.slice(1, -1) : value
          // Delimiters may themselves be character references. Scan whole
          // references so their '#' is not mistaken for a URL fragment, and
          // let the HTML parser decode them in attribute context.
          const decoder = document.createElement('div')
          const delimiters =
            /&(?:#(?:[xX][0-9a-fA-F]+|[0-9]+);?|[a-zA-Z][a-zA-Z0-9]*;?)|[?#]/g
          let query: RegExpExecArray | null = null
          let fragment: RegExpExecArray | null = null
          let token: RegExpExecArray | null
          while ((token = delimiters.exec(raw))) {
            let delimiter = token[0]
            if (delimiter[0] === '&') {
              decoder.innerHTML = `<i a="${delimiter}"></i>`
              delimiter = decoder.firstElementChild!.getAttribute('a') || ''
            }
            if (delimiter === '#') {
              fragment = token
              break
            }
            if (delimiter === '?' && !query) query = token
          }
          if (!query) {
            const at = fragment?.index ?? raw.length
            return `${prefix}${quote}${raw.slice(0, at)}?v=${hash}${raw.slice(at)}${quote}`
          }
          const at = query.index + query[0].length
          const hasQuery = at < (fragment?.index ?? raw.length)
          return `${prefix}${quote}${raw.slice(0, at)}v=${hash}${hasQuery ? '&amp;' : ''}${raw.slice(at)}${quote}`
        }
      )
      edits.push({
        start: attr.startOffset,
        end: attr.endOffset,
        text: updated
      })
    }
  }

  const head = dom.nodeLocation(document.head) as
    ElementLocation | null | undefined
  const firstHeadScript = scripts.find((script) =>
    document.head.contains(script)
  )
  const scriptLocation = firstHeadScript
    ? dom.nodeLocation(firstHeadScript)
    : undefined
  // A policy after an app script cannot govern the new boot without moving it
  // ahead of that script. Refuse rather than silently execute boot outside it.
  const policies = Array.from(document.head.querySelectorAll('meta')).filter(
    (meta) =>
      (meta.getAttribute('http-equiv') || '').trim().toLowerCase() ===
      'content-security-policy'
  )
  if (
    scriptLocation &&
    policies.some(
      (meta) =>
        (dom.nodeLocation(meta)?.startOffset ?? 0) > scriptLocation.startOffset
    )
  ) {
    dom.window.close()
    throw new Error(
      'Cannot insert mock boot before an app script and after its head CSP meta tag'
    )
  }

  // The end location of an implicitly closed head can point at its start tag,
  // not the end of its children. Use source locations of the actual head nodes
  // instead, keeping all existing metadata in front of boot.
  const lastHeadNode = Array.from(document.head.childNodes)
    .map((node) => dom.nodeLocation(node))
    .filter((location) => location != null)
    .pop()
  const body = dom.nodeLocation(document.body) as
    ElementLocation | null | undefined
  const htmlLocation = dom.nodeLocation(document.documentElement) as
    ElementLocation | null | undefined
  const firstBodyNode = Array.from(document.body.childNodes)
    .map((node) => dom.nodeLocation(node))
    .find((location) => location != null)
  const at =
    scriptLocation?.startOffset ??
    head?.endTag?.startOffset ??
    lastHeadNode?.endOffset ??
    head?.startTag?.endOffset ??
    body?.startTag?.startOffset ??
    firstBodyNode?.startOffset ??
    htmlLocation?.endTag?.startOffset ??
    htmlLocation?.startTag?.endOffset ??
    patched.length
  const boot =
    bootTag(version, basePath) +
    (basePath && config
      ? `<script src="${basePath}/host/mount-config.js?v=${MOUNT_CONFIG_VERSION}"></script>`
      : '')
  const explicitHead = !head?.startTag && !lastHeadNode && !scriptLocation
  edits.push({
    start: at,
    end: at,
    text: explicitHead ? `<head>${boot}</head>` : boot
  })
  if (!scripts.length) warnings.push('no script tags found')
  // Locate the inserted tag after edits to earlier source attributes shift it.
  const bootOffset =
    at +
    edits.reduce(
      (shift, edit) =>
        edit.start !== at && edit.end <= at
          ? shift + edit.text.length - (edit.end - edit.start)
          : shift,
      0
    ) +
    (explicitHead ? '<head>'.length : 0)
  edits.sort((a, b) => b.start - a.start)
  for (const edit of edits)
    patched = patched.slice(0, edit.start) + edit.text + patched.slice(edit.end)
  dom.window.close()

  // An unterminated title, comment, or tag can consume inserted markup as text.
  // Reparse the actual output and reject it rather than shipping a missing boot.
  const checked = new JSDOM(patched, { includeNodeLocations: true })
  const inserted = Array.from(
    checked.window.document.head.querySelectorAll('script')
  ).find((script) => checked.nodeLocation(script)?.startOffset === bootOffset)
  checked.window.close()
  if (!inserted)
    throw new Error('Cannot safely insert mock boot into the HTML head')

  // A stylesheet the page links is a page asset like a script, and the one that
  // paints the canvas is the reason this matters: a palette change behind an
  // unchanged URL reaches a returning reader up to two hours late, which is a
  // white flash the fix was meant to remove. Its URL follows the file's contents
  // for the same reason a script's does. An `integrity` attribute travels with
  // it untouched - SRI digests the bytes, so a versioned URL still satisfies it.
  //
  // A `rel=preload as=style` for the same file is versioned too: leaving it at
  // the unversioned URL warms one cache entry while the stylesheet is fetched
  // cold at another, which is the request the preload existed to save.
  if (outputFolder) {
    patched = patched.replace(
      /<link\b([^>]*)>/gi,
      (tag: string, source: string) => {
        const attributes = parseAttributes(source)
        const rel = (attributes.rel || '').trim().toLowerCase().split(/\s+/)
        const preloadsStyle =
          rel.includes('preload') &&
          (attributes.as || '').trim().toLowerCase() === 'style'

        if (!rel.includes('stylesheet') && !preloadsStyle) return tag

        const href = attributes.href
        if (!href) return tag

        const [versioned] = versionScripts([{ src: href }], outputFolder)
        return versioned.src === href
          ? tag
          : tag.replace(href, () => versioned.src as string)
      }
    )
  }

  return { patched, warnings }
}

/**
 * The folder the console lives in, under the site root.
 *
 * Not `api`: an application can answer `/api` itself - this framework's own server
 * interface does - and a page there would collide with its route, so a site
 * refresh on that screen would land on the console instead of the application.
 */
const API_CONSOLE_DIR = 'api-console'

/** The files the console consists of, under `<output>/api-console`. */
const API_CONSOLE_FILES = [
  'index.html',
  'console.js',
  'console.css',
  'operations.json'
]

/**
 * The API console: a page at `<base>/api-console/` that lists every operation the API
 * document declares and sends them against this host.
 *
 * The route table is the same one the worker answers from (`ROUTES` from
 * @sasjs/api), so the console cannot drift from the API: a route the package
 * adds appears here on the next build, with the parameters it declares.
 *
 * Three files and the data, all static. It is a developer surface rather than a
 * screen of the app, so nothing in the page links to it and nothing preloads it -
 * a visit costs the demo nothing until someone types the URL.
 */
const writeApiConsole = (
  outputFolder: string,
  version: string,
  basePath: string
) => {
  const folder = path.join(outputFolder, API_CONSOLE_DIR)
  // `<base>/api-console/` is this build's, not the project's: a site that ships its own
  // files there would have them replaced without a word, so it keeps them and
  // the console is left out
  const taken = API_CONSOLE_FILES.filter((file) =>
    fs.existsSync(path.join(folder, file))
  )
  if (taken.length)
    return {
      written: false,
      operations: 0,
      warning:
        `The site already carries ${taken
          .map((file) => API_CONSOLE_DIR + '/' + file)
          .join(', ')}, so the API console was not written. ` +
        'Move those files, or set streamConfig.mockApi to false to silence this.'
    }

  fs.mkdirSync(folder, { recursive: true })

  // The console starts the host itself, so it has to ask for the same worker the
  // app's loader asks for: a registration is identified by its script URL, and a
  // bare `sw.js` here would replace the versioned one on every visit to either
  // page - an install nobody asked for, which is what the version exists to avoid.
  const consoleScript = fs.readFileSync(
    path.join(ASSETS_FOLDER, 'api-console.js')
  )
  const consoleVersion = createHash('md5')
    .update(consoleScript)
    .digest('hex')
    .slice(0, 10)
  fs.writeFileSync(
    path.join(folder, 'index.html'),
    fs
      .readFileSync(path.join(ASSETS_FOLDER, 'api-index.html'), 'utf8')
      .replace('__MOCK_VERSION__', version)
      .replace('__MOCK_BASE__', basePath + '/')
      .replace('src="console.js"', `src="console.js?v=${consoleVersion}"`)
  )
  fs.copyFileSync(
    path.join(ASSETS_FOLDER, 'api-console.js'),
    path.join(folder, 'console.js')
  )
  fs.copyFileSync(
    path.join(ASSETS_FOLDER, 'api-console.css'),
    path.join(folder, 'console.css')
  )

  const operations = ROUTES.map((route) => ({
    id: route.id,
    method: route.method,
    path: route.path,
    tag: route.tag,
    summary: route.summary,
    params: route.params,
    requestBodies: route.requestBodies,
    responses: route.responses,
    implemented: route.implemented,
    reason: route.reason
  }))
  fs.writeFileSync(
    path.join(folder, 'operations.json'),
    JSON.stringify(operations, null, 2)
  )

  return { written: true, operations: operations.length }
}

/**
 * The file, at the root of a mock site, that says what the folder is.
 *
 * A mock site is built outside the deployment and must never be packed into one,
 * including when a project points `mockWebFolder` inside the build folder and
 * when a previous build left its output there. The build therefore has to be able
 * to recognise one: the marker is written by every mock build, and a build that
 * is not a mock carries none. It is also what tells a developer, opening the
 * folder, which of the three frontends this one is.
 */
export const MOCK_SITE_MARKER = 'sasjs.mock.json'

/**
 * Where the standalone mock site is written.
 *
 * It is an output of its own, not a folder of the build: a site that runs the
 * app in a browser needs a static server on localhost, and nothing about it
 * belongs in a deployment. `sasjsresults/mock` by default; an explicit
 * `mockWebFolder` is honoured as it always was, relative to the project.
 */
export const mockSiteOutputFolder = (target: Target): string => {
  const projectDir = process.projectDir || process.cwd()
  const configured = target.streamConfig?.mockWebFolder

  if (configured) return path.resolve(projectDir, configured)

  const resultsFolder =
    process.sasjsConstants.buildDestinationResultsFolder ||
    path.join(projectDir, 'sasjsresults')

  return path.join(resultsFolder, 'mock')
}

/**
 * Whether a folder IS a mock site, by its marker.
 *
 * A mock site's marker sits at the site's own root, so this answers for that
 * folder - not for one of its parents. The build skips the site itself by this
 * question, whatever its path and whichever build wrote it. An ancestor of a
 * nested site is ordinary content, and is packed only if something else in it is:
 * an ancestor left empty by the exclusion is dropped rather than deployed.
 */
export const isMockSiteFolder = (folder: string): boolean =>
  fs.existsSync(path.join(folder, MOCK_SITE_MARKER))

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

  const outputFolder = mockSiteOutputFolder(target)

  assertSafeOutputFolder(
    outputFolder,
    projectDir,
    buildFolder,
    webFolder,
    protectedBuildFolders(target)
  )

  // Read the drive before anything is written or removed: an unusable target
  // (SAS services, unreadable build folder) then leaves the previous site in
  // place instead of destroying it and failing.
  // A streamed build carries its web assets inside the deployment, and they
  // belong on the drive: that is the copy a page reads its assets from through
  // the `_FILE=` read, so the artefact a server would serve is the one this site
  // serves. The unmodified frontend is still what the site itself is, so a
  // project has both the app at the root and the deployment on the drive.

  // A previous site may sit inside the build folder; leaving it out of the seed
  // keeps the old site out of the new drive.
  const { files: seed, skipped } = seedFromBuild(buildFolder, appLoc, [
    outputFolder
  ])
  // Opt-in only: a project lists extensionless JavaScript service twins in its
  // sync folder. The manifest reaches the compile output as a root-level file.
  // Validate before replacing a previously built site; never register SAS source.
  const registration = path.join(buildFolder, 'viya-mock-jobs.json')
  let viyaMockJobs: string[] = []
  try {
    viyaMockJobs = JSON.parse(fs.readFileSync(registration, 'utf8'))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  if (
    !Array.isArray(viyaMockJobs) ||
    viyaMockJobs.some(
      (name) =>
        typeof name !== 'string' ||
        !/^services\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+$/.test(name) ||
        !Object.prototype.hasOwnProperty.call(
          seed,
          `/sasjs/drive/files${appLoc}/${name}.js`
        )
    )
  )
    throw new Error(
      'viya-mock-jobs.json must list existing extensionless services/*.js paths'
    )
  const registeredViyaJobs =
    target.serverType === 'SASVIYA'
      ? [...new Set(viyaMockJobs)].map((name) => `${appLoc}/${name}`)
      : []
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

  // say what this folder is, for a developer reading it and for `sasjs build`,
  // which must never pack it into a deployment
  fs.writeFileSync(
    path.join(outputFolder, MOCK_SITE_MARKER),
    JSON.stringify(
      { kind: 'sasjs-mock-site', builtAt: new Date().toISOString() },
      null,
      2
    )
  )

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
  // The browser formatter fetches its lexer vocabulary lazily. Version the
  // directory to avoid a static host serving a previous release's cached data.
  for (const folder of ['data', 'pubsdata']) {
    fs.cpSync(
      path.join(LANGUAGE_ROOT, folder),
      path.join(hostFolder, 'sas-language', LANGUAGE_VERSION, folder),
      { recursive: true }
    )
  }
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

  // The page a static host answers an unknown path with. The backend is the
  // worker, and a worker only answers a page it controls, so the site needs one
  // page that installs it and asks again - otherwise a deep link into the
  // deployment (a streamed app's entry page, a route under the API) resolves
  // only for a visitor who loaded the site once first. Published for every
  // target, streamed or not: any path the host has no file for lands here.
  //
  // Two things are baked in, because the page cannot know them at runtime: the
  // base path (a site mounted one folder down names its own script, worker and
  // home link, not the host's root) and the host version - the same `?v=` stamp
  // and `updateViaCache: 'none'` the app's own loader uses, so this
  // registration asks for the same worker instead of installing a second one
  // for the same scope.
  // A project may ship its own not-found page - macro-dash did, for exactly this
  // reason, before the build carried one. Publishing the generated page over it
  // silently would throw that work away, so it is said out loud: the generated
  // page is the one that installs the worker, so it is the one that is published.
  if (fs.existsSync(path.join(outputFolder, '404.html')))
    process.logger?.warn(
      'The project supplies a 404.html; the generated not-found page replaces it ' +
        'in the published site (it is the one that installs the worker and retries ' +
        'the address). Keep project-specific messaging in the app itself.'
    )
  process.logger?.info(
    'Published the generated not-found page as 404.html (and 404.js).'
  )
  fs.writeFileSync(
    path.join(outputFolder, '404.html'),
    fs
      .readFileSync(path.join(ASSETS_FOLDER, 'fallback.html'), 'utf8')
      .replace('src="/404.js"', () => `src="${basePath}/404.js"`)
  )
  fs.writeFileSync(
    path.join(outputFolder, '404.js'),
    fs
      .readFileSync(path.join(ASSETS_FOLDER, 'fallback.js'), 'utf8')
      /* a function replacement: a base path is configuration, and `$&` in one
       * would be read as a replacement pattern and corrupt the script */
      .replace(/__BASE__/g, () => basePath)
      .replace(/__HOST_VERSION__/g, () => hostVersion)
  )

  // The identity of this build's drive AND its fixture: the seed itself, and the
  // identity the site signs in with. The host files are re-fetched on every
  // load, so a change to them needs no re-seed; a change to either the seed or
  // the fixture does, because the drive and the identity row a visitor already
  // has were written by the build before this one. A page that finds a stamp
  // from another build drops both and takes this build's - the fixture is only
  // read from `host/identity.json` when there is no stored row, so a project
  // that edits only `mock-identity.json` would otherwise never reach a returning
  // visitor.
  const buildStamp = createHash('md5')
    .update(
      JSON.stringify({
        files: Object.keys(seed)
          .sort()
          .map((key) => [key, seed[key]]),
        identity: identity.fixture
      })
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
  //
  // It is written as an index plus shards rather than one file: the visitor's
  // first page reads the boot shard, and a shard is fetched when something reads
  // a path in it. The capture the project keeps is unchanged - the split is the
  // build's, so an existing snapshot builds exactly as before.
  const snapshotSource = path.join(buildFolder, 'mock-snapshot.json')
  const hasSnapshot = fs.existsSync(snapshotSource)
  let snapshotShards = 0
  if (hasSnapshot) {
    const capture = JSON.parse(fs.readFileSync(snapshotSource, 'utf8'))
    if (
      capture &&
      capture.format !== undefined &&
      capture.format !== DRIVE_FORMAT
    )
      throw new Error(
        `The captured drive at ${snapshotSource} is format ` +
          `${JSON.stringify(capture.format)}, and this build writes format ` +
          `${DRIVE_FORMAT}. Seed the drive again with window.SASjsMock.download().`
      )
    const files = capture && capture.files ? capture.files : capture
    if (!files || typeof files !== 'object')
      throw new Error(
        `The captured drive at ${snapshotSource} carries no files - the export is a JSON object of path to contents.`
      )

    const split = shardSnapshot(files)
    for (const shard of split.shards)
      fs.writeFileSync(
        path.join(hostFolder, shard.file),
        JSON.stringify({ format: DRIVE_FORMAT, files: shard.files })
      )
    fs.writeFileSync(
      path.join(hostFolder, 'vfs-snapshot.json'),
      JSON.stringify(split.index, null, 2)
    )
    snapshotShards = split.shards.length
  }

  // 2d. a recorded SAS session, if the project ships one. A browser has no SAS
  // binary, so every SAS run is answered from a session - a run, a code run, and
  // a trigger, which reaches the runtime rather than the run route and is
  // answered there. This file's recording of the program answers when it names
  // one (the log, listing and webout of a session already run), and the host's
  // mocked session otherwise. The file is the project's own output where it has
  // it; the mock is what makes a site complete without one.
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
        viyaMockJobs: registeredViyaJobs,
        seedPath: 'host/vfs-seed.json',
        driveEntries,
        jsPrograms,
        programFolders: PROGRAM_FOLDERS,
        snapshot: hasSnapshot,
        snapshotShards,
        sasTranscript: hasTranscript,
        identity: identity.source,
        buildStamp,
        builtAt: new Date().toISOString()
      },
      null,
      2
    )
  )

  // 3b. the API console, unless the target turns it off. Nothing links to it: it
  // is a developer surface beside the app, and a page nobody visits costs the
  // demo nothing.
  let apiConsole = false
  if (target.streamConfig?.mockApi !== false) {
    const written = writeApiConsole(outputFolder, hostVersion, basePath)
    apiConsole = written.written
    if (written.warning) process.logger?.warn(written.warning)
  }

  // 4. point the app at itself
  if (basePath)
    fs.writeFileSync(
      path.join(hostFolder, 'mount-config.js'),
      MOUNT_CONFIG_SCRIPT
    )
  const indexPath = path.join(outputFolder, 'index.html')
  const { patched, warnings } = patchIndexHtml(
    fs.readFileSync(indexPath, 'utf8'),
    hostVersion,
    basePath,
    outputFolder,
    // Only SAS9 needs the backend target stamped into the copied frontend.
    // Other targets historically kept the frontend's adapter configuration;
    // in particular a Viya deployment target often serves a SASJS mock app.
    target.serverType === 'SAS9' ? target.serverType : undefined,
    target.serverType === 'SAS9' ? appLoc : undefined
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
    snapshotShards,
    apiConsole,
    sasTranscript: hasTranscript,
    identitySource: identity.source
  }
}
