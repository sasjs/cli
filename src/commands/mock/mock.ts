import fs from 'fs'
import path from 'path'
import { folderExists, Target } from '@sasjs/utils'

/**
 * Builds a static site that runs the project's JS services (its mocks) in the
 * browser, so a frontend can be tested with no server and no SAS.
 *
 * The output is an ordinary folder of static files: serve it over http(s) and
 * the app behaves as though it were talking to a single-user SASjs server. The
 * work happens in a service worker, so every request is still a real request -
 * visible in DevTools > Network, marked "(from ServiceWorker)" - and the drive
 * it writes to is persisted in IndexedDB, so refreshes keep their state.
 */
export interface MockSiteOptions {
  /** Build folder to seed from (default: the compile output, sasjsbuild). */
  servicesFolder?: string
  /** Folder holding the built web app, relative to the project root. */
  webSourcePath?: string
  /** SASjs Drive location the app expects its services under. */
  appLoc?: string
  /** Where to write the static site, relative to the project root. */
  outputFolder?: string
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
}

const ASSETS_FOLDER = path.join(__dirname, 'assets')

const toPosix = (value: string) => value.split(path.sep).join('/')

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

const seedFromBuild = (
  buildFolder: string,
  appLoc: string,
  exclude: string[] = [],
  excludeFolders: string[] = []
) => {
  const files: { [path: string]: string } = {}
  const driveBase = `/sasjs/drive/files${appLoc}`

  const entries = fs.readdirSync(buildFolder, { withFileTypes: true })

  // The program folders always go in, even when compile left them out of this
  // build; everything else is carried across so a sync folder's content (a
  // licence store, for instance) survives too.
  const directories = entries.filter((entry) => entry.isDirectory())
  for (const name of PROGRAM_FOLDERS) {
    if (!directories.some((entry) => entry.name === name)) {
      const present = fs.existsSync(path.join(buildFolder, name))
      if (present) directories.push({ name, isDirectory: () => true } as any)
    }
  }

  for (const entry of directories) {
    const folder = path.join(buildFolder, entry.name)
    if (excludeFolders.includes(path.resolve(folder))) continue
    if (!fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) continue
    for (const relative of listFiles(folder)) {
      const key = `${driveBase}/${entry.name}/${relative}`
      if (exclude.some((prefix) => key.startsWith(prefix))) continue
      files[key] = fs.readFileSync(path.join(folder, relative), 'utf8')
    }
  }

  return files
}

const countJsPrograms = (files: { [path: string]: string }) =>
  Object.keys(files).filter((key) => {
    const inProgramFolder = PROGRAM_FOLDERS.some((folder) =>
      key.includes(`/${folder}/`)
    )
    return inProgramFolder && key.toLowerCase().endsWith('.js')
  }).length

const loaderScript = (mainScript: string) => `<script>
    // Boot order: register the service worker that hosts the mock backend, wait
    // until it controls this page, hand it the persisted drive, install the XHR
    // bridge, then start the app.
    (function () {
      function load(src, next, isModule) {
        var s = document.createElement('script')
        if (isModule) s.type = 'module'
        s.src = src
        s.onload = next
        s.onerror = function () { console.error('[mock] failed to load ' + src); next() }
        document.body.appendChild(s)
      }
      function start() {
        load('host/persist.js', function () {
          Promise.resolve(window.__sasjsMockReady).then(function (boot) {
            if (boot && boot.error) console.error('[mock] boot: ' + boot.error)
            load('host/intercept.js', function () {
              load('${mainScript}', function () {}, true)
            })
          })
        })
      }
      if (!('serviceWorker' in navigator)) {
        console.error('[mock] service workers are unavailable - the mock backend cannot run')
        start()
        return
      }
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .then(function () { return navigator.serviceWorker.ready })
        .then(function () {
          if (navigator.serviceWorker.controller) return
          return new Promise(function (resolve) {
            var timer = setTimeout(resolve, 4000)
            navigator.serviceWorker.addEventListener('controllerchange', function () {
              clearTimeout(timer)
              resolve()
            })
          })
        })
        .then(function () {
          if (navigator.serviceWorker.controller) return start()
          if (!sessionStorage.getItem('mock-sw-reloaded')) {
            sessionStorage.setItem('mock-sw-reloaded', '1')
            location.reload()
            return
          }
          console.error('[mock] no service worker controller - requests will fail')
          start()
        })
        .catch(function (err) {
          console.error('[mock] service worker registration failed: ' + err)
          start()
        })
    })()
  </script>`

/**
 * Points the app at its own origin and replaces its bundle tag with the
 * boot loader. Both changes are reported when the expected markup is absent,
 * rather than producing a site that silently talks to a real server.
 */
const patchIndexHtml = (html: string) => {
  const warnings: string[] = []
  let patched = html

  if (/<sasjs[^>]*>/i.test(patched)) {
    patched = patched.replace(
      /(<sasjs[^>]*?)\sserverurl="[^"]*"/i,
      '$1 serverurl=""'
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

  const mainMatch = patched.match(
    /<script[^>]*src="([^"]*main[^"]*\.js)"[^>]*><\/script>/i
  )

  if (mainMatch) {
    patched = patched.replace(mainMatch[0], loaderScript(mainMatch[1]))
  } else {
    warnings.push(
      'no main bundle script tag found - the mock loader was not installed'
    )
  }

  return { patched, warnings }
}

export async function buildMockSite(
  target: Target,
  options: MockSiteOptions = {}
): Promise<MockSiteResult> {
  const projectDir = process.projectDir || process.cwd()
  // Paths the user types are relative to where they ran the command; defaults
  // are relative to the project root (the folder above `sasjs/`).
  const invocationDir = (process as any).currentDir || process.cwd()
  const appLocRaw = options.appLoc || (target as any).appLoc
  if (!appLocRaw) {
    throw new Error(
      'No appLoc. Set appLoc on the target, or pass --apploc <path>. It has to match the appLoc the app is built with.'
    )
  }
  const appLoc = '/' + appLocRaw.replace(/^\/+/, '').replace(/\/+$/, '')

  // Default: the compile output. `--services` points at a different build
  // folder when the mocks come from another project (the sasjs/server pattern
  // most repos use: a small mocks project next to the real one).
  const buildFolder = options.servicesFolder
    ? path.resolve(invocationDir, options.servicesFolder)
    : process.sasjsConstants.buildDestinationFolder ||
      path.join(projectDir, 'sasjsbuild')

  if (!(await folderExists(buildFolder))) {
    throw new Error(
      `Build folder not found: ${buildFolder}. Run \`sasjs compile\` first, or pass --services <build folder>.`
    )
  }

  const webSourceRaw =
    options.webSourcePath ||
    (target.streamConfig && target.streamConfig.webSourcePath)
  if (!webSourceRaw) {
    throw new Error(
      'No built web app. Pass --web <folder> (for example ./client/dist), or set streamConfig.webSourcePath on the target.'
    )
  }
  // A path from the config is relative to the project root; a path typed by
  // the user is relative to where they ran the command.
  const webFolder = options.webSourcePath
    ? path.resolve(invocationDir, webSourceRaw)
    : path.resolve(projectDir, webSourceRaw)
  if (!(await folderExists(webFolder))) {
    throw new Error(
      `Web source folder not found: ${webFolder}. Build the frontend first.`
    )
  }
  if (!fs.existsSync(path.join(webFolder, 'index.html'))) {
    throw new Error(
      `${webFolder} does not contain an index.html - is that the built app?`
    )
  }

  const mockWebFolder = target.streamConfig?.mockWebFolder

  const outputFolder = options.outputFolder
    ? path.resolve(invocationDir, options.outputFolder)
    : mockWebFolder
      ? path.resolve(projectDir, mockWebFolder)
      : path.join(
          process.sasjsConstants.buildDestinationFolder ||
            path.join(projectDir, 'sasjsbuild'),
          'mock'
        )

  // A previous site may sit inside the build folder; removing it first keeps it
  // out of the drive seed as well as out of the way.
  fs.rmSync(outputFolder, { recursive: true, force: true })

  // Read the drive before writing the output, so an unusable target fails
  // without leaving a half-written site behind.
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

  const seed = seedFromBuild(buildFolder, appLoc, excluded, [outputFolder])
  const jsPrograms = countJsPrograms(seed)
  const driveEntries = Object.keys(seed).length

  if (jsPrograms === 0) {
    throw new Error(
      `No .js programs in ${buildFolder}/services, /jobs or /tests. This target builds SAS code, which cannot run in a browser. ` +
        'Compile a project whose services are JavaScript (typically a mocks project), or pass --services <build folder>.'
    )
  }

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
    'intercept.js'
  ]) {
    fs.copyFileSync(
      path.join(ASSETS_FOLDER, asset),
      path.join(hostFolder, asset)
    )
  }
  // sw.js sits at the site root: a worker can only control the folder it is
  // served from, and the app has to be controlled from /
  fs.copyFileSync(
    path.join(ASSETS_FOLDER, 'sw.js'),
    path.join(outputFolder, 'sw.js')
  )

  // 2b. a captured drive, if the project keeps one. This is how a site ships
  // with data already in it: seed once in a browser, export the drive with
  // window.SASjsMock.download(), and place the file here.
  const snapshotSource = path.join(buildFolder, 'mock-snapshot.json')
  const hasSnapshot = fs.existsSync(snapshotSource)
  if (hasSnapshot) {
    fs.copyFileSync(snapshotSource, path.join(hostFolder, 'vfs-snapshot.json'))
  }

  // 3. the drive, laid out from the compile output
  fs.writeFileSync(
    path.join(hostFolder, 'vfs-seed.json'),
    JSON.stringify({ files: seed })
  )

  fs.writeFileSync(
    path.join(hostFolder, 'mock-config.json'),
    JSON.stringify(
      {
        appLoc,
        seedPath: '/host/vfs-seed.json',
        driveEntries,
        jsPrograms,
        programFolders: PROGRAM_FOLDERS,
        snapshot: hasSnapshot,
        builtAt: new Date().toISOString()
      },
      null,
      2
    )
  )

  // 4. point the app at itself
  const indexPath = path.join(outputFolder, 'index.html')
  const { patched, warnings } = patchIndexHtml(
    fs.readFileSync(indexPath, 'utf8')
  )
  fs.writeFileSync(indexPath, patched)
  warnings.forEach((warning) => process.logger?.warn(warning))

  return {
    outputFolder,
    appLoc,
    driveEntries,
    jsPrograms,
    webFileCount,
    snapshot: hasSnapshot
  }
}
