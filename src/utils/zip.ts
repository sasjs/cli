import fs from 'fs'
import path from 'path'
import { Readable } from 'stream'
import { openPromise, Entry } from 'yauzl'

/**
 * Extracts a zip archive to the given directory.
 *
 * Replaces adm-zip's extractAllTo (GHSA-vwc7-r8mq-g2x9: extraction follows
 * destination symlinks, allowing arbitrary file overwrite). This
 * implementation never follows symlinks at the destination: every path
 * component is checked with fs.lstatSync and extraction of an entry aborts
 * if a symlink is found where a directory or file is expected.
 *
 * Directories mentioned only implicitly by entry paths are created; explicit
 * directory entries are honoured. Unix file mode bits are preserved (needed
 * by e.g. .git-hooks files in seed apps, which git requires to be
 * executable). Overwriting of existing regular files is opt-in; existing
 * symlinks are never written through.
 *
 * @param {string} zipPath - path of the zip archive to extract.
 * @param {string} destDir - directory to extract into (created if missing).
 * @param {boolean} overwrite - whether existing regular files are replaced.
 */
export const extractZip = async (
  zipPath: string,
  destDir: string,
  overwrite = false
): Promise<void> => {
  const zipfile = await openPromise(zipPath, {
    lazyEntries: true,
    decodeStrings: true,
    validateEntrySizes: true
  })

  try {
    for await (const entry of zipfile.eachEntry()) {
      await extractEntry(zipfile, entry, destDir, overwrite)
    }
  } finally {
    zipfile.close()
  }
}

const extractEntry = async (
  zipfile: Awaited<ReturnType<typeof openPromise>>,
  entry: Entry,
  destDir: string,
  overwrite: boolean
): Promise<void> => {
  const entryPath = entry.fileName
  const isDirectoryEntry = entryPath.endsWith('/')

  // yauzl's validateFileName (applied when decodeStrings is true) rejects
  // absolute paths and .. traversal, guaranteeing the joined destination
  // stays inside destDir.
  const destPath = path.join(destDir, entryPath)

  // Ensure every parent directory exists, refusing to traverse a symlink.
  const parents = path.dirname(destPath)
  await ensureDirNoSymlink(destDir, parents)

  if (isDirectoryEntry) {
    // Explicit directory entry: create it (mode as-is; dirs are rwxr-xr-x by default).
    fs.mkdirSync(destPath, { recursive: true })
    return
  }

  // Refuse to extract through an existing symlink at the destination.
  let destStat: fs.Stats | null = null
  try {
    destStat = fs.lstatSync(destPath)
  } catch {
    destStat = null
  }
  if (destStat) {
    if (destStat.isSymbolicLink()) {
      throw new Error(
        `Refusing to extract "${entryPath}": destination is a symbolic link.`
      )
    }
    if (!destStat.isFile()) {
      throw new Error(
        `Refusing to extract "${entryPath}": destination is not a regular file.`
      )
    }
    if (!overwrite) return
  }

  const readStream = await zipfile.openReadStreamPromise(entry)
  await streamToFile(readStream, destPath)

  // Preserve unix mode bits (external attrs high 16 bits), e.g. the exec bit
  // on .git-hooks files in seed apps.
  const mode = (entry.externalFileAttributes >>> 16) & 0o7777
  if (mode) fs.chmodSync(destPath, mode)
}

/**
 * Creates dirPath (which must be at or under rootDir), creating parents as
 * needed, and throws if any existing path component is a symbolic link.
 */
const ensureDirNoSymlink = async (rootDir: string, dirPath: string) => {
  const rootParts = path.resolve(rootDir).split(path.sep)
  const targetParts = path.resolve(dirPath).split(path.sep)

  // Walk from the root down to the target, mkdir-ing each level.
  let current = rootParts[0] || path.sep
  for (let i = 1; i < targetParts.length; i++) {
    current = path.join(current, targetParts[i])
    const exists = fs.existsSync(current)
    if (exists) {
      const stat = fs.lstatSync(current)
      if (stat.isSymbolicLink()) {
        throw new Error(
          `Refusing to extract into "${current}": symbolic link in destination path.`
        )
      }
      if (!stat.isDirectory()) {
        throw new Error(
          `Cannot extract into "${current}": exists and is not a directory.`
        )
      }
    } else {
      fs.mkdirSync(current, { recursive: false })
    }
  }
}

const streamToFile = async (readStream: Readable, destPath: string) => {
  const writeStream = fs.createWriteStream(destPath, {
    flags: 'w',
    mode: 0o666
  })
  await pipelinePromise(readStream, writeStream)
}

const pipelinePromise = (readable: Readable, writable: fs.WriteStream) =>
  new Promise<void>((resolve, reject) => {
    readable.on('error', reject)
    writable.on('error', reject)
    writable.on('close', resolve)
    readable.pipe(writable)
  })
