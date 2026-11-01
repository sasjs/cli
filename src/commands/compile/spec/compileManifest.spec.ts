import path from 'path'
import { symlink } from 'fs/promises'
import {
  createFile,
  createFolder,
  deleteFile,
  deleteFolder,
  fileExists
} from '@sasjs/utils'
import { setConstants } from '../../../utils'
import { generateUniqueTimestamp } from '../../../utils/test'
import {
  getChangedFiles,
  getManifestFolders,
  getManifestPath,
  readCompileManifest,
  writeCompileManifest
} from '../internal'

describe('compile manifest', () => {
  let folderPath: string

  beforeAll(async () => {
    await setConstants(false)
  })

  beforeEach(async () => {
    folderPath = path.join(
      __dirname,
      `cli-tests-manifest-${generateUniqueTimestamp()}`
    )
    await createFolder(folderPath)
  })

  afterEach(async () => {
    await deleteFolder(folderPath)
  })

  it('records what the compile read, and reports nothing when it is unchanged', async () => {
    await createFile(path.join(folderPath, 'service.sas'), '%put hello;')

    await writeCompileManifest([folderPath])

    const manifest = await readCompileManifest()
    expect(manifest).not.toBeNull()
    expect(Object.keys(manifest!)).toHaveLength(1)

    await expect(getChangedFiles([folderPath])).resolves.toEqual([])
  })

  it('reports a file whose content changed', async () => {
    await createFile(path.join(folderPath, 'service.sas'), '%put hello;')
    await writeCompileManifest([folderPath])

    await createFile(path.join(folderPath, 'service.sas'), '%put goodbye;')

    const changed = await getChangedFiles([folderPath])

    expect(changed).toHaveLength(1)
    expect(changed[0]).toEqual(path.join(folderPath, 'service.sas'))
  })

  it('reports a file the manifest has never seen, including in a sub folder', async () => {
    await writeCompileManifest([folderPath])

    await createFolder(path.join(folderPath, 'editors'))
    await createFile(
      path.join(folderPath, 'editors', 'getdata.js'),
      'const a = 1'
    )

    const changed = await getChangedFiles([folderPath])

    expect(changed).toHaveLength(1)
    expect(changed[0]).toEqual(path.join(folderPath, 'editors', 'getdata.js'))
  })

  it('hashes test files, which live in the service folders and are compiled too', async () => {
    await createFile(path.join(folderPath, 'getdata.test.1.sas'), '%put test;')
    await writeCompileManifest([folderPath])

    await createFile(
      path.join(folderPath, 'getdata.test.1.sas'),
      '%put changed test;'
    )

    const changed = await getChangedFiles([folderPath])

    expect(changed).toHaveLength(1)
    expect(changed[0]).toContain('getdata.test.1.sas')
  })

  it('reports a stamp file whose content changed', async () => {
    const stamp = path.join(folderPath, 'package.json')

    await createFile(stamp, '{"dependencies":{"@sasjs/core":"6.1.0"}}')
    await writeCompileManifest([], [stamp])

    await createFile(stamp, '{"dependencies":{"@sasjs/core":"6.2.0"}}')

    await expect(getChangedFiles([], [stamp])).resolves.toEqual([stamp])
  })

  it('reports a stamp file the manifest has never seen', async () => {
    const stamp = path.join(folderPath, 'package-lock.json')

    await writeCompileManifest([])
    await createFile(stamp, '{}')

    await expect(getChangedFiles([], [stamp])).resolves.toEqual([stamp])
  })

  it('treats a corrupt manifest as a project that has not been compiled', async () => {
    await writeCompileManifest([folderPath])
    await createFile(getManifestPath(), 'not json at all')

    const changed = await getChangedFiles([folderPath])

    expect(changed).toHaveLength(1)
    expect(changed[0]).toContain('no compile manifest')
  })

  it('hashes a macro core that lives inside the project', async () => {
    const previousCorePath = process.sasjsConstants.macroCorePath
    process.sasjsConstants.macroCorePath = folderPath

    const folders = await getManifestFolders({
      name: 'core-in-project'
    } as unknown as Parameters<typeof getManifestFolders>[0])

    expect(folders).toContain(folderPath)

    process.sasjsConstants.macroCorePath = previousCorePath
  })

  it('hashes the sync folder when the project syncs one', async () => {
    const previousConfig = process.sasjsConfig
    process.sasjsConfig = {
      ...(previousConfig || {}),
      syncFolder: folderPath
    } as typeof process.sasjsConfig

    const folders = await getManifestFolders({
      name: 'sync-folder'
    } as unknown as Parameters<typeof getManifestFolders>[0])

    expect(folders.map((folder) => path.resolve(folder))).toContain(
      path.resolve(folderPath)
    )

    process.sasjsConfig = previousConfig
  })

  it('hashes the web source folder when the target streams the web', async () => {
    const folders = await getManifestFolders({
      name: 'stream-web',
      streamConfig: {
        streamWeb: true,
        streamWebFolder: 'web',
        webSourcePath: folderPath,
        streamServiceName: 'index'
      }
    } as unknown as Parameters<typeof getManifestFolders>[0])

    expect(folders.map((folder) => path.resolve(folder))).toContain(
      path.resolve(folderPath)
    )
  })

  it('skips a file that cannot be read instead of failing the check', async () => {
    await createFile(path.join(folderPath, 'service.sas'), '%put hello;')
    await writeCompileManifest([folderPath])

    // a broken link is listed but cannot be read: neither the write nor the
    // check may throw over it
    await symlink(
      path.join(folderPath, 'no-such-target.sas'),
      path.join(folderPath, 'broken.sas')
    )

    await expect(writeCompileManifest([folderPath])).resolves.toBeUndefined()
    await expect(getChangedFiles([folderPath])).resolves.toBeDefined()
  })

  it('does not fail the compile when the manifest cannot be written', async () => {
    const previous = process.sasjsConstants.buildDestinationFolder

    // a file used as if it were a directory: the manifest write cannot succeed
    process.sasjsConstants.buildDestinationFolder = path.join(
      __filename,
      'no-such-folder'
    )

    await expect(writeCompileManifest([folderPath])).resolves.toBeUndefined()

    process.sasjsConstants.buildDestinationFolder = previous
  })

  it('treats a manifest that is not an object as unreadable', async () => {
    await writeCompileManifest([folderPath])
    await createFile(getManifestPath(), '42')

    const changed = await getChangedFiles([folderPath])

    expect(changed[0]).toContain('no compile manifest')
  })

  it('leaves out a configured folder that does not exist', async () => {
    const previousConfig = process.sasjsConfig
    const missing = path.join(folderPath, 'not-created')

    process.sasjsConfig = {
      ...(previousConfig || {}),
      syncFolder: missing
    } as typeof process.sasjsConfig

    const folders = await getManifestFolders({
      name: 'missing-sync-folder'
    } as unknown as Parameters<typeof getManifestFolders>[0])

    expect(folders.map((folder) => path.resolve(folder))).not.toContain(
      path.resolve(missing)
    )

    process.sasjsConfig = previousConfig
  })

  it('treats a missing manifest as a project that has not been compiled', async () => {
    const manifestPath = getManifestPath()
    if (await fileExists(manifestPath)) await deleteFile(manifestPath)

    const changed = await getChangedFiles([folderPath])

    expect(changed).toHaveLength(1)
    expect(changed[0]).toContain('no compile manifest')
  })
})
