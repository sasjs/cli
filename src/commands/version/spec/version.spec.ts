import { mkdirSync, mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import { printVersion, versionMessage } from '../version'

const writePackage = (dir: string, version: string | undefined) => {
  mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ version }))
}

const tempRoot = () => mkdtempSync(path.join(tmpdir(), 'sasjs-version-'))

const packageRoot = () => path.join(tempRoot(), 'node_modules', '@sasjs', 'cli')

describe('printVersion', () => {
  it('reports the package that is running, with no global install involved', async () => {
    // The suite runs from the sources, where `npm list -g @sasjs/cli` has
    // nothing to report - the call must still resolve, and name this package.
    const message = await printVersion()

    expect(message).toContain(path.resolve(__dirname, '../../../..'))
    expect(message).toMatch(/^You are using (SASjs CLI v|a linked version)/)
  })
})

describe('versionMessage', () => {
  it('reports an installed version', () => {
    const root = packageRoot()

    writePackage(root, '6.4.6')

    expect(versionMessage(root)).toEqual('You are using SASjs CLI v6.4.6')
  })

  it('reports a source checkout as a linked version', () => {
    const root = path.join(tempRoot(), 'cli')

    writePackage(root, '6.4.7-alpha.1')

    expect(versionMessage(root)).toEqual(
      `You are using a linked version of SASjs CLI (v6.4.7-alpha.1) running from sources at ${root}`
    )
  })

  it('leaves the version out of a source checkout that has none', () => {
    const root = path.join(tempRoot(), 'cli')

    writePackage(root, undefined)

    expect(versionMessage(root)).toEqual(
      `You are using a linked version of SASjs CLI running from sources at ${root}`
    )
  })

  it('reports the whole version string, not a fragment of it', () => {
    const root = packageRoot()

    writePackage(root, '1.2.3-beta.4')

    expect(versionMessage(root)).toEqual(
      'You are using SASjs CLI v1.2.3-beta.4'
    )
  })

  it('throws an actionable error when the package.json is missing', () => {
    const root = packageRoot()

    expect(() => versionMessage(root)).toThrow(
      /Unable to read the CLI version from/
    )
  })

  it('throws when an installed package carries no version', () => {
    const root = packageRoot()

    writePackage(root, undefined)

    expect(() => versionMessage(root)).toThrow(
      /has no version in its package.json/
    )
  })
})
