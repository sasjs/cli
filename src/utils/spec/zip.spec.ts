import fs from 'fs'
import path from 'path'
import yazl from 'yazl'
import { isWindows } from '@sasjs/utils'
import { extractZip } from '../zip'
import {
  createFile,
  deleteFolder,
  readFile,
  generateTimestamp
} from '@sasjs/utils'

const makeZip = (
  entries: { name: string; content: string; mode?: number }[],
  zipPath: string
) =>
  new Promise<void>((resolve, reject) => {
    const zip = new yazl.ZipFile()
    entries.forEach((e) =>
      zip.addBuffer(Buffer.from(e.content, 'utf8'), e.name, { mode: e.mode })
    )
    zip.outputStream.pipe(fs.createWriteStream(zipPath)).on('close', resolve)
    zip.outputStream.on('error', reject)
    zip.end()
  })

/**
 * Rewrites the versionMadeBy host platform byte (high byte of the central
 * directory field) of every entry, simulating an archive created on a
 * different host (e.g. 0 = MS-DOS/Windows). Used to prove that mode bits
 * from non-unix hosts are ignored.
 */
const setEntryPlatform = (zipPath: string, platform: number) => {
  const buffer = fs.readFileSync(zipPath)
  const eocd = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  if (eocd < 0) throw new Error('end of central directory record not found')
  const cdSize = buffer.readUInt32LE(eocd + 12)
  const cdOffset = buffer.readUInt32LE(eocd + 16)
  let p = cdOffset
  const end = cdOffset + cdSize
  while (p < end) {
    if (buffer.readUInt32LE(p) !== 0x02014b50) break // central file header
    const versionMadeBy = buffer.readUInt16LE(p + 4)
    buffer.writeUInt16LE((versionMadeBy & 0xff) | (platform << 8), p + 4)
    const nlen = buffer.readUInt16LE(p + 28)
    const elen = buffer.readUInt16LE(p + 30)
    const clen = buffer.readUInt16LE(p + 32)
    p += 46 + nlen + elen + clen
  }
  fs.writeFileSync(zipPath, buffer)
}

describe('zip', () => {
  const tmpRoot = path.join(__dirname, `zip-spec-${generateTimestamp()}`)
  const destDir = path.join(tmpRoot, 'dest')

  beforeAll(async () => {
    fs.mkdirSync(destDir, { recursive: true })
  })

  afterAll(async () => {
    await deleteFolder(tmpRoot).catch(() => {})
  })

  describe('extractZip', () => {
    it('should extract nested files and create implicit directories', async () => {
      const zipPath = path.join(tmpRoot, 'app.zip')
      await makeZip(
        [
          { name: 'app-main/a/b/file.txt', content: 'nested content' },
          { name: 'app-main/top.txt', content: 'top content' }
        ],
        zipPath
      )

      await extractZip(zipPath, destDir, true)

      const nested = await readFile(
        path.join(destDir, 'app-main', 'a', 'b', 'file.txt')
      )
      expect(nested).toEqual('nested content')

      const top = await readFile(path.join(destDir, 'app-main', 'top.txt'))
      expect(top).toEqual('top content')
    })

    it('should create explicit directory entries', async () => {
      const zipPath = path.join(tmpRoot, 'dirs.zip')
      await makeZip(
        [{ name: 'app-main/public/docs/.gitkeep', content: '' }],
        zipPath
      )

      await extractZip(zipPath, destDir, true)

      expect(
        fs.existsSync(path.join(destDir, 'app-main', 'public', 'docs'))
      ).toBeTrue()
    })

    it('should preserve unix mode bits', async () => {
      if (isWindows()) return // chmod exec bits are a no-op on Windows

      const zipPath = path.join(tmpRoot, 'modes.zip')
      await makeZip(
        [
          { name: 'app-main/hook', content: '#!/bin/bash\n', mode: 0o755 },
          { name: 'app-main/plain.txt', content: 'plain', mode: 0o644 }
        ],
        zipPath
      )

      await extractZip(zipPath, destDir, true)

      const hookMode = fs.statSync(path.join(destDir, 'app-main', 'hook')).mode
      expect(hookMode & 0o111).not.toEqual(0)
    })

    it('should not apply mode bits from non-unix (e.g. Windows) archives', async () => {
      if (isWindows()) return // chmod exec bits are a no-op on Windows

      const zipPath = path.join(tmpRoot, 'winmodes.zip')
      await makeZip(
        [{ name: 'app-main/binary', content: 'MZ', mode: 0o755 }],
        zipPath
      )
      // Simulate a Windows-created archive: same externalFileAttributes
      // (exec bits set by yazl), but versionMadeBy platform 0 (MS-DOS).
      setEntryPlatform(zipPath, 0)

      await extractZip(zipPath, destDir, true)

      // The entry's externalFileAttributes high bits are not a unix mode
      // on non-unix platforms - applying them would chmod the file 755.
      const mode = fs.statSync(path.join(destDir, 'app-main', 'binary')).mode
      expect(mode & 0o111).toEqual(0)
    })

    it('should not write through a symlink at the destination', async () => {
      if (isWindows()) return // symlink creation needs elevated privileges

      const zipPath = path.join(tmpRoot, 'evil.zip')
      await makeZip([{ name: 'app-main/target.txt', content: 'EVIL' }], zipPath)

      const victimPath = path.join(tmpRoot, 'victim.txt')
      await createFile(victimPath, 'ORIGINAL')

      // plant a symlink where the entry wants to write
      fs.mkdirSync(path.join(destDir, 'app-main'), { recursive: true })
      fs.symlinkSync(victimPath, path.join(destDir, 'app-main', 'target.txt'))

      await expect(extractZip(zipPath, destDir, true)).rejects.toThrow(
        /symbolic link/
      )

      const victim = await readFile(victimPath)
      expect(victim).toEqual('ORIGINAL')
    })

    it('should not extract into a symlinked parent directory', async () => {
      if (isWindows()) return // symlink creation needs elevated privileges

      const zipPath = path.join(tmpRoot, 'evilparent.zip')
      await makeZip([{ name: 'app-main/x.txt', content: 'x' }], zipPath)

      const realDir = path.join(tmpRoot, 'realdir')
      fs.mkdirSync(realDir, { recursive: true })
      const linkDir = path.join(tmpRoot, 'linkdir')
      fs.symlinkSync(realDir, linkDir)

      await expect(extractZip(zipPath, linkDir, true)).rejects.toThrow(
        /symbolic link/
      )

      expect(fs.readdirSync(realDir).length).toEqual(0)
    })

    it('should skip existing files when overwrite is false', async () => {
      const zipPath = path.join(tmpRoot, 'skip.zip')
      await makeZip([{ name: 'app-main/skipme.txt', content: 'NEW' }], zipPath)

      const existingPath = path.join(destDir, 'app-main', 'skipme.txt')
      fs.mkdirSync(path.join(destDir, 'app-main'), { recursive: true })
      await createFile(existingPath, 'EXISTING')

      await extractZip(zipPath, destDir, false)

      const content = await readFile(existingPath)
      expect(content).toEqual('EXISTING')
    })
  })
})
