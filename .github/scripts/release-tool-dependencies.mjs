#!/usr/bin/env node
/**
 * Asserts that the release tool resolves to nothing, and is pinned exactly.
 *
 * `.github/workflows/npmpublish.yml` runs `@sasjs/release` on the one job that
 * holds publishing credentials. What audit gate covers it? `npm audit
 * --omit=dev` skips it, because it is a devDependency, and a full-tree audit
 * cannot answer the question either: this repo's dev tree carries advisories
 * from the jest chain that are not the release tool's, and failing on those
 * would teach the reader to ignore the job.
 *
 * So the property is asserted directly, from the lockfile, which needs no
 * install: the tool is declared at an exact version, that version is the one the
 * lockfile resolved, and it has no dependencies - so nothing it runs is
 * unaudited. A bump that changes any of that fails here, and whoever bumps it
 * decides what the audit should be rather than inheriting a silent gap.
 *
 *     node .github/scripts/release-tool-dependencies.mjs
 *
 * Exits 0 when the tool is pinned exactly, integrity-checked and dependency-free.
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

// A range is not a pin, and the integrity hash only speaks for the version it
// resolved to: `^0.1.3` with 0.1.9 in the tree would pass a check that only
// looked at the hash.
const declared = lock.packages['']?.devDependencies?.[TOOL]
if (!declared) fail(`${TOOL} is in the lockfile but not in devDependencies`)
if (!/^\d+\.\d+\.\d+$/.test(declared))
  fail(
    `${TOOL} is declared as "${declared}", which is not an exact version. ` +
      'It runs on the publishing job, so pin it exactly.'
  )
if (declared !== entry.version)
  fail(
    `${TOOL} is declared as ${declared} but the lockfile resolved ` +
      `${entry.version}. Re-run npm install so the declaration and the resolved ` +
      'version agree.'
  )

if (!entry.integrity)
  fail(`${TOOL}@${entry.version} has no integrity hash in the lockfile`)

// `bundleDependencies` is a list of names in a lockfile entry, so Object.keys
// on it answers indices - which is how a refusal once read "declares 2
// dependencies (0, 1)".
const bundled = Array.isArray(entry.bundleDependencies)
  ? entry.bundleDependencies
  : Object.keys(entry.bundleDependencies || {})

const declaredDeps = [
  ...Object.keys(entry.dependencies || {}),
  ...Object.keys(entry.peerDependencies || {}),
  ...Object.keys(entry.optionalDependencies || {}),
  ...bundled
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
  `${TOOL}@${entry.version} is pinned exactly in devDependencies, carries an integrity hash, and resolves to nothing else`
)
