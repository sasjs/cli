#!/usr/bin/env node
/**
 * Asserts that the release tool resolves to nothing.
 *
 * `.github/workflows/npmpublish.yml` runs `@sasjs/release` on the one job that
 * holds publishing credentials. What audit gate covers it? `npm audit
 * --omit=dev` skips it, because it is a devDependency, and a full-tree audit
 * cannot answer the question either: this repo's dev tree carries advisories
 * from the jest chain that are not the release tool's, and failing on those
 * would teach the reader to ignore the job.
 *
 * So the property is asserted directly, from the lockfile, which needs no
 * install: the tool has no dependencies, so nothing it resolves is unaudited. A
 * bump that changes that fails here, and whoever bumps it decides what the audit
 * should be rather than inheriting a silent gap.
 *
 *     node .github/scripts/release-tool-dependencies.mjs
 *
 * Exits 0 when the tool is pinned, integrity-checked and dependency-free.
 */
import { readFileSync } from 'fs'

const TOOL = '@sasjs/release'
const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'))
const entry = lock.packages?.[`node_modules/${TOOL}`]

const fail = (message) => {
  console.error(`::error::${message}`)
  process.exit(1)
}

if (!entry) fail(`${TOOL} is not in package-lock.json - is it still a devDependency?`)

// a version is not a pin: the integrity hash is what makes the bytes the ones
// that were reviewed
const declared = lock.packages['']?.devDependencies?.[TOOL]
if (!declared) fail(`${TOOL} is in the lockfile but not in devDependencies`)
if (!entry.integrity)
  fail(`${TOOL}@${entry.version} has no integrity hash in the lockfile`)

const declaredDeps = [
  ...Object.keys(entry.dependencies || {}),
  ...Object.keys(entry.peerDependencies || {}),
  ...Object.keys(entry.optionalDependencies || {}),
  ...Object.keys(entry.bundleDependencies || {})
]

if (declaredDeps.length) {
  fail(
    `${TOOL}@${entry.version} now declares ${declaredDeps.length} dependenc${
      declaredDeps.length === 1 ? 'y' : 'ies'
    } (${declaredDeps.join(', ')}). ` +
      'Nothing audits the tool that publishes this package, because it is a devDependency and ' +
      '`npm audit --omit=dev` skips it. Decide what the gate should be before bumping.'
  )
}

console.log(
  `${TOOL}@${entry.version} is pinned in devDependencies, carries an integrity hash, and resolves to nothing else`
)
