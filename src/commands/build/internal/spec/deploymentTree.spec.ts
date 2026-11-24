import path from 'path'

import { excludedFromPack } from '../deploymentTree'

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
  const projectDir = path.join(path.sep, 'project')
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
