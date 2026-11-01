import path from 'path'
import { createHash } from 'crypto'
import { readFile } from 'fs/promises'
import {
  createFile,
  fileExists,
  folderExists,
  getAbsolutePath,
  listFilesInFolder,
  listSubFoldersInFolder,
  readFile as readTextFile,
  Target
} from '@sasjs/utils'
import {
  getMacroFolders,
  getProgramFolders,
  getStreamConfig,
  getTestSetUp,
  getTestTearDown
} from '../../../utils/config'
import { getAllFolders, SasFileType } from './getAllFolders'

/**
 * Hashes of the source files the last compile read, keyed by absolute path.
 *
 * The build folder cannot be used as the record of what was compiled: `compile`
 * transforms the files it writes (macros and includes are inlined), so a
 * compiled service never matches its source byte for byte. Comparing content
 * hashes against a manifest written at the end of a successful compile is what
 * makes "the source changed" detectable without the reader passing a force flag.
 */
export type CompileManifest = Record<string, string>

const MANIFEST_NAME = '.compile-manifest.json'

export const getManifestPath = () =>
  path.join(process.sasjsConstants.buildDestinationFolder, MANIFEST_NAME)

const hashFile = async (filePath: string) =>
  createHash('md5')
    .update(await readFile(filePath))
    .digest('hex')

// A file can be listed and then be gone, or be unreadable. Reporting it as
// changed is safe; throwing from the middle of a compile is not.
const hashFileIfReadable = async (filePath: string) => {
  try {
    return await hashFile(filePath)
  } catch (_) {
    return undefined
  }
}

const listSourceFiles = async (
  folder: string,
  relative = '',
  files: string[] = []
) => {
  const folderPath = path.join(folder, relative)

  for (const fileName of await listFilesInFolder(folderPath)) {
    files.push(path.join(relative, fileName))
  }

  for (const subFolder of await listSubFoldersInFolder(folderPath)) {
    await listSourceFiles(folder, path.join(relative, subFolder), files)
  }

  return files
}

// Absolute paths: the manifest lives in the build folder, which is per-machine
// and rebuilt, so portability buys nothing and relative paths would depend on
// process.projectDir being set.
const manifestKey = (folder: string, relativePath: string) =>
  path.join(folder, relativePath)

export const writeCompileManifest = async (
  folders: string[],
  stampFiles: string[] = []
) => {
  const manifest: CompileManifest = {}

  for (const folder of folders) {
    for (const relativePath of await listSourceFiles(folder)) {
      const hash = await hashFileIfReadable(path.join(folder, relativePath))

      if (hash) manifest[manifestKey(folder, relativePath)] = hash
    }
  }

  for (const filePath of stampFiles) {
    const hash = await hashFileIfReadable(filePath)

    if (hash) manifest[filePath] = hash
  }

  // A failure here costs one extra compile next time, it does not break the
  // build that just succeeded.
  await createFile(getManifestPath(), JSON.stringify(manifest, null, 2)).catch(
    () => undefined
  )
}

export const readCompileManifest =
  async (): Promise<CompileManifest | null> => {
    const manifestPath = getManifestPath()

    if (!(await fileExists(manifestPath))) return null

    try {
      const manifest = JSON.parse(await readTextFile(manifestPath))

      return manifest && typeof manifest === 'object' ? manifest : null
    } catch (_) {
      return null
    }
  }

/**
 * Names the source files that have changed since the last successful compile:
 * edited content, new files, and files the manifest has never seen.
 */
export const getChangedFiles = async (
  folders: string[],
  stampFiles: string[] = []
) => {
  const manifest = await readCompileManifest()

  if (!manifest)
    return ['no compile manifest - the project has not been compiled here']

  // The current state of everything the compile reads, keyed the same way.
  const current: Record<string, string | undefined> = {}

  for (const folder of folders) {
    for (const relativePath of await listSourceFiles(folder)) {
      current[manifestKey(folder, relativePath)] = await hashFileIfReadable(
        path.join(folder, relativePath)
      )
    }
  }

  for (const filePath of stampFiles) {
    current[filePath] = await hashFileIfReadable(filePath)
  }

  const changed: string[] = []

  for (const [key, hash] of Object.entries(current)) {
    if (hash && manifest[key] !== hash) changed.push(key)
  }

  // A source the compile read last time and cannot see now is a change too:
  // deleting a macro or a service alters the build as much as editing one.
  for (const key of Object.keys(manifest)) {
    if (!(key in current)) changed.push(key)
  }

  return changed
}

/**
 * Every folder whose contents feed the build: the services and jobs, plus the
 * web app and the sync folder when the target uses them. A skip is only safe if
 * it accounts for all of them - a frontend change with an unchanged services
 * folder must still rebuild.
 */
export const getManifestFolders = async (target: Target) => {
  const folders = [
    ...(await getAllFolders(target, SasFileType.Service)),
    ...(await getAllFolders(target, SasFileType.Job)),
    // macros and program files are inlined into every service that needs them,
    // so editing one changes the compiled output even when no service moved.
    ...(await getMacroFolders(target)),
    ...(await getProgramFolders(target))
  ]

  // A macro core installed under node_modules is a dependency: the version in
  // its package.json is the cheap signal for a bump (see getManifestStamps).
  // A core kept inside the project is source, so its files are hashed.
  const macroCorePath = process.sasjsConstants?.macroCorePath

  if (
    macroCorePath &&
    !macroCorePath.includes(`${path.sep}node_modules${path.sep}`)
  )
    folders.push(macroCorePath)

  const streamConfig = await getStreamConfig(target)

  if (streamConfig?.streamWeb && streamConfig.webSourcePath) {
    folders.push(
      getAbsolutePath(streamConfig.webSourcePath, process.projectDir)
    )
  }

  const syncFolder = process.sasjsConfig?.syncFolder

  if (syncFolder) folders.push(getAbsolutePath(syncFolder, process.projectDir))

  const existing: string[] = []

  for (const folder of folders) {
    if (await folderExists(folder)) existing.push(folder)
  }

  return existing
}

/**
 * Individual files whose change invalidates the whole build.
 *
 * The test programs are not inside a service folder, and the dependency
 * manifests are the record of which @sasjs/core a build used: a core bump
 * arrives as an install, so the version in `node_modules/@sasjs/core` and the
 * lockfile are the signals - walking every macro of the library would cost
 * more than it catches.
 */
export const getManifestStamps = async (target: Target) => {
  const stamps: (string | undefined)[] = [
    path.join(process.projectDir, 'package.json'),
    path.join(process.projectDir, 'package-lock.json'),
    path.join(
      process.projectDir,
      'node_modules',
      '@sasjs',
      'core',
      'package.json'
    ),
    // test programs are configured relative to the project root
    ...[await getTestSetUp(target), await getTestTearDown(target)].map(
      (stamp) => (stamp ? getAbsolutePath(stamp, process.projectDir) : '')
    )
  ].filter((stamp): stamp is string => !!stamp)

  const existing: string[] = []

  for (const stamp of stamps) {
    if (stamp && (await fileExists(stamp))) existing.push(stamp)
  }

  return existing
}
