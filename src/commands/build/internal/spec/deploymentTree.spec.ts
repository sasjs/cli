import fs from 'fs'
import os from 'os'
import path from 'path'
import { ServerType } from '@sasjs/utils'

import { excludedFromPack, getDeploymentTree } from '../deploymentTree'

/**
 * The folders `build` keeps out of the pack.
 *
 * The mock output is excluded when it sits inside the build, and only then: a
 * `mockWebFolder` that resolves to the project, the project's parent or the build
 * itself is not a folder the pack can lose. The `.` case is the one that bit:
 * `path.relative(build, project)` is `..`, and a containment check that forgets
 * `..` reads that as "inside the build" and excludes every deployment folder
 * beneath it.
 */
describe('the folders build keeps out of the pack', () => {
  // resolved the same way `mockSiteOutputFolder` resolves a configured folder,
  // so a drive-relative root (`\project` on Windows) does not compare as two
  // different folders
  const projectDir = path.resolve(path.sep, 'project')
  const buildFolder = path.join(projectDir, 'sasjsbuild')
  const publishFolder = path.join(buildFolder, 'publish')

  const excluded = (mockWebFolder?: string) =>
    excludedFromPack(
      { streamConfig: mockWebFolder ? { mockWebFolder } : {} } as any,
      publishFolder
    )

  beforeEach(() => {
    process.projectDir = projectDir
    process.sasjsConstants = { buildDestinationFolder: buildFolder } as any
  })

  afterEach(() => {
    process.projectDir = ''
    process.sasjsConstants = undefined as any
  })

  it('excludes the published frontend always', () => {
    expect(excluded()).toEqual([publishFolder])
  })

  it('excludes a mock output inside the build', () => {
    expect(excluded('sasjsbuild/mock')).toEqual([
      publishFolder,
      path.join(buildFolder, 'mock')
    ])
  })

  it('does not exclude the project, its parent, or the build itself', () => {
    for (const mockWebFolder of ['.', '..', 'sasjsbuild', projectDir, path.sep])
      expect(excluded(mockWebFolder)).toEqual([publishFolder])
  })

  it('does not exclude a folder outside the project', () => {
    expect(excluded(path.join(path.sep, 'elsewhere', 'mock'))).toEqual([
      publishFolder
    ])
  })
})

describe('the tree a build packs', () => {
  let root: string
  let build: string

  const write = (relative: string, content = 'x') => {
    const file = path.join(build, relative)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, content)
  }

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'sasjs-tree-'))
    build = path.join(root, 'sasjsbuild')
    fs.mkdirSync(build, { recursive: true })
    process.projectDir = root
    process.sasjsConstants = { buildDestinationFolder: build } as any
  })

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true })
    process.projectDir = ''
    process.sasjsConstants = undefined as any
  })

  it('packs a project file at the root, and the streamed entry page with it', async () => {
    write('site.webmanifest.json', '{}')
    write('demo.html', '<html></html>')

    const { folderContentJSON } = await getDeploymentTree(
      ServerType.Sasjs,
      build,
      [],
      (fileName) =>
        fileName === 'demo.json' ||
        fileName === 'demo.json.zip' ||
        fileName === 'demo_compileTree.json' ||
        fileName === 'demo.sas'
    )

    const names = folderContentJSON.members.map((member) => member.name)
    expect(names).toContain('demo.html')
    expect(names).toContain('site.webmanifest.json')
  })

  it('leaves the build outputs out, by name', async () => {
    write('demo.json', '{}')
    write('demo.json.zip', 'zip')
    write('demo_compileTree.json', '{}')
    write('.compile-manifest.json', '{}')
    write('demo.sas', '%put build;')
    write('other.json', '{"kept":true}')

    const { folderContentJSON } = await getDeploymentTree(
      ServerType.Sasjs,
      build,
      [],
      (fileName) =>
        fileName === 'demo.json' ||
        fileName === 'demo.json.zip' ||
        fileName === 'demo_compileTree.json' ||
        fileName === '.compile-manifest.json' ||
        fileName === 'demo.sas'
    )

    const names = folderContentJSON.members.map((member) => member.name)
    expect(names).not.toContain('demo.json')
    expect(names).toEqual(['other.json'])
  })

  it('leaves a mock site written before the marker out of the pack', async () => {
    // an older CLI wrote the site to <build>/mock and wrote no marker
    write('mock/sw.js', '// worker')
    write('mock/host/boot.js', '// host')
    write('services/common/getdata.js', 'console.log(1)')

    const { folderContentJSON } = await getDeploymentTree(
      ServerType.Sasjs,
      build
    )

    const names = folderContentJSON.members.map((member) => member.name)
    expect(names).toContain('services')
    expect(names).not.toContain('mock')
  })

  it('does not leave an empty parent behind for a nested mock site', async () => {
    write('sites/mock/sasjs.mock.json', '{}')
    write('sites/mock/sw.js', '// worker')
    write('sites/notes.txt', 'kept')

    const { folderContentJSON } = await getDeploymentTree(
      ServerType.Sasjs,
      build
    )

    const sites = folderContentJSON.members.find(
      (member) => member.name === 'sites'
    ) as any
    expect(sites.members.map((member: any) => member.name)).toEqual([
      'notes.txt'
    ])

    // and with nothing else in it, the parent is not deployed either
    fs.rmSync(path.join(build, 'sites', 'notes.txt'))
    const { folderContentJSON: withoutNotes } = await getDeploymentTree(
      ServerType.Sasjs,
      build
    )
    expect(withoutNotes.members.map((member) => member.name)).not.toContain(
      'sites'
    )
  })

  it('builds the JSON tree without the SAS text when asked', async () => {
    write('services/common/getdata.js', 'console.log(1)')

    const { folderContent, folderContentJSON } = await getDeploymentTree(
      ServerType.Sasjs,
      build,
      [],
      undefined,
      false
    )

    // the published frontend half needs the members and nothing else
    expect(folderContent).toEqual('')
    expect(folderContentJSON.members.map((member) => member.name)).toEqual([
      'services'
    ])
  })

  it('keeps a project folder called mock when it is not a mock site', async () => {
    write('mock/data.json', '{}')

    const { folderContentJSON } = await getDeploymentTree(
      ServerType.Sasjs,
      build
    )

    expect(folderContentJSON.members.map((member) => member.name)).toContain(
      'mock'
    )
  })
})
