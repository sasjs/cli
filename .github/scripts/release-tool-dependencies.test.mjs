import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT = fileURLToPath(new URL('./release-tool-dependencies.mjs', import.meta.url))

/** A repository whose lockfile is the fixture, and the gate run against it. */
function run({ declared = '0.1.3', resolved = '0.1.3', entry = {}, root = {} } = {}) {
  const cwd = mkdtempSync(join(tmpdir(), 'release-tool-'))
  const lock = {
    name: 'fixture',
    version: '0.0.0',
    lockfileVersion: 3,
    packages: {
      '': { devDependencies: declared === null ? {} : { '@sasjs/release': declared }, ...root },
      'node_modules/@sasjs/release': {
        version: resolved,
        resolved: 'https://registry.npmjs.org/@sasjs/release/-/release-0.1.3.tgz',
        integrity: 'sha512-fixture',
        dev: true,
        ...entry
      }
    }
  }
  writeFileSync(join(cwd, 'package-lock.json'), JSON.stringify(lock))

  try {
    return { ok: true, out: execFileSync('node', [SCRIPT], { cwd, encoding: 'utf8' }) }
  } catch (error) {
    return { ok: false, out: String(error.stderr || error.stdout || error.message) }
  }
}

test('passes for an exact pin that resolves to nothing', () => {
  const { ok, out } = run()
  assert.equal(ok, true)
  assert.match(out, /is pinned exactly in devDependencies/)
})

test('fails when the declaration is a range, even if the hash matches', () => {
  // measured: `^0.1.3` with 0.1.9 resolved passed a check that only looked at
  // the integrity hash
  const { ok, out } = run({ declared: '^0.1.3', resolved: '0.1.9' })
  assert.equal(ok, false)
  assert.match(out, /is not an exact version/)
})

test('fails when the declaration and the resolved version disagree', () => {
  const { ok, out } = run({ declared: '0.1.3', resolved: '0.1.9' })
  assert.equal(ok, false)
  assert.match(out, /declared as 0\.1\.3 but the lockfile resolved 0\.1\.9/)
})

test('fails when the tool declares a dependency', () => {
  const { ok, out } = run({ entry: { dependencies: { chalk: '4.1.2' } } })
  assert.equal(ok, false)
  assert.match(out, /declares 1 dependency \(chalk\)/)
})

test('names bundled dependencies rather than their indices', () => {
  // measured: Object.keys on the array printed "declares 2 dependencies (0, 1)"
  const { ok, out } = run({
    entry: { bundleDependencies: ['undici', 'tough-cookie'] }
  })
  assert.equal(ok, false)
  assert.match(out, /declares 2 dependencies \(undici, tough-cookie\)/)
})

test('fails when the tool is not in the lockfile at all', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'release-tool-'))
  writeFileSync(
    join(cwd, 'package-lock.json'),
    JSON.stringify({ version: '0.0.0', packages: { '': { devDependencies: {} } } })
  )
  try {
    execFileSync('node', [SCRIPT], { cwd, encoding: 'utf8' })
    assert.fail('expected the gate to fail')
  } catch (error) {
    assert.match(String(error.stderr), /is not in package-lock\.json/)
  }
})
