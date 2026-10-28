#!/usr/bin/env node
/**
 * A strict audit of the RELEASE TOOLCHAIN in release/.
 *
 * Kept separate from the package's own `npm audit` on purpose. The toolchain is
 * not shipped, so its advisories should not gate the package - but it runs in CI
 * with publish credentials, so it must not be invisible either. This reports it
 * in its own scope, by name.
 *
 * Anything not listed in EXEMPT fails the build, and so does an exemption that
 * stops appearing: the list is a claim about the locked tree, and a claim that
 * no longer holds is deleted rather than left to rot. Both are failures because
 * a stale entry is invisible in a passing build, and a list that only warns
 * drifts out of step with the tree it describes.
 *
 * The list is short because the locked npm is current: npm 11.21.1 vendors
 * fixed brace-expansion, http-cache-semantics, postcss-selector-parser and
 * undici, so the advisories against those do not appear. A lockfile that pinned
 * npm back would bring them back, and they would fail this gate until they are
 * listed again. The ip-address advisory published after that npm release does
 * appear - npm vendors the affected version - and is exempted below.
 *
 * Every exemption carries its own argument - where the affected code sits,
 * whether this repo's release path runs it, and whose input reaches it. An
 * advisory whose input arrives from outside this repo is a risk acceptance
 * rather than a non-issue, and its entry says so rather than claiming
 * unreachability.
 *
 * Uses --package-lock-only, so it needs no install and runs cheaply on a PR.
 *
 * The same script ships in adapter, cli, sas-language, utils and
 * vscode-extension. EXEMPT describes the tree it sits in, so each repo carries
 * its own list: a lockfile bump that clears an entry in one has to land in the
 * others before theirs can shrink.
 *
 * Run with `node release/audit.mjs`.
 */
import { execFileSync } from 'node:child_process'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const releaseDir = dirname(fileURLToPath(import.meta.url))

/**
 * Advisories in the release toolchain that cannot be fixed from this repo, and why.
 */
const EXEMPT = new Map([
  [
    'GHSA-xjj6-f33q-929c',
    "undici 6.29.0, bundled inside npm 11.21.1 (npm declares its dependencies as bundled ones, so the copy is a file inside npm's own tarball), which @semantic-release/npm resolves from its npm ^11.6.2 range; 11.21.1 is the newest 11.x. Patched in 6.29.1, published after it. Measured in this tree: an `overrides` entry for undici leaves node_modules/npm/node_modules/undici at 6.29.0, because a bundled dependency is not a resolvable node; and forcing npm 12.2.1 was measured too - its published tarball also bundles undici 6.29.0. The two copies that CAN be reached were fixed by override in release/package.json (top level 7.30.0 -> 7.30.1, @actions/http-client 6.29.0 -> 6.29.1), which cleared the sibling advisory GHSA-f72v-6w45-q472 outright. RISK ACCEPTANCE for the remainder: the affected code paths are npm's own HTTP client during publish, exercised only against the registry over a metadata response, so what reaches it is the registry's reply rather than anything in this repo - a publish-time denial of service, not code execution. Clears when npm ships undici >= 6.29.1 in its bundled tree; the advisory then disappears and this entry fails the gate until it is deleted."
  ],
  [
    'GHSA-4qv8-2p9j-2685',
    "Same bundled copy as GHSA-xjj6-f33q-929c above - undici 6.29.0 inside npm 11.21.1, not reachable by `overrides`, and not moved by npm 12.2.1 (measured: that tarball bundles 6.29.0). This one is the EventSource parser's memory growth; the release toolchain never constructs an EventSource, so the affected parser is not instantiated on this path at all. Clears with the same npm bump, and this entry fails the gate until it is deleted."
  ],
  [
    'GHSA-2m5v-pch6-74hx',
    "Same bundled copy as GHSA-xjj6-f33q-929c above - undici 6.29.0 inside npm 11.21.1, patched in 6.29.1, not reachable by `overrides` because a bundled dependency is not a resolvable node, and not moved by npm 12.2.1 (measured: that tarball also bundles 6.29.0). This one drops TLS options in an Agent, so it applies to npm's own HTTP client during publish - which talks to the registry and to the GitHub API over TLS with the CA bundle this runner ships, and no part of that exchange lets a peer choose the agent options. Clears when npm ships undici >= 6.29.1 bundled; the entry then fails the gate until it is deleted."
  ],
  [
    'GHSA-qrxm-fqhp-jwvm',
    "Same bundled copy again - undici 6.29.0 inside npm 11.21.1, patched in 6.29.1, unreachable by `overrides` and unchanged by npm 12.2.1. The TLS 1.2 certificate-changing renegotiation path needs a peer that renegotiates mid-connection; Node disables renegotiation by default and the publish endpoints are the registry and api.github.com, so nothing in this repo supplies that peer. RISK ACCEPTANCE on the publish path, not unreachability - the transport can in principle be reached if those endpoints were hostile. Clears with the bundled undici bump."
  ],
  [
    'GHSA-9fm3-97px-rjf6',
    "Same bundled copy - undici 6.29.0 inside npm 11.21.1, patched in 6.29.1, unreachable by `overrides`, unchanged by npm 12.2.1. This one is WebSocket PONG buffering; the release toolchain never opens a WebSocket, so the affected code is not instantiated on the publish path at all. Clears with the same npm bump."
  ],
  [
    'GHSA-rxp7-6hxx-x8q5',
    "ip-address 10.7.2, bundled inside npm 11.21.1, which @semantic-release/npm resolves from its npm ^11.6.2 range. 11.21.1 is the newest 11.x, and the version npm bundles cannot be overridden from here - adding `overrides` for ip-address to release/package.json leaves the lockfile at 10.7.2, which was measured. RISK ACCEPTANCE, not unreachability: the parse runs only on a proxy address that carries an Address6 zone identifier; the exposure is a stall during publish, and that string can arrive from standard npm proxy configuration (`npm_config_proxy`, `HTTPS_PROXY`), so the input path is reachable and the accepted risk is a publish-time stall rather than a package-supplied one. No bump in this repo moves it - forcing npm 12.2.1 inside the toolchain was measured too, and the lockfile still resolves ip-address 10.7.2 through socks 2.8.9. It clears only when npm ships ip-address >= 10.7.4 in its own bundled tree; the advisory then disappears and this entry fails the gate until it is deleted."
  ]
])

const run = () => {
  try {
    return execFileSync(
      'npm',
      ['audit', '--package-lock-only', '--json', '--prefix', releaseDir],
      {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore']
      }
    )
  } catch (error) {
    // npm audit exits non-zero when it finds anything, which is the case we are
    // here to read, so the report on stdout is the payload either way.
    if (error.stdout) return error.stdout
    throw error
  }
}

let report
try {
  report = JSON.parse(run())
} catch {
  console.error('could not read the npm audit report for release/')
  process.exit(1)
}

const ghsaOf = (via) => {
  if (typeof via === 'string') return undefined
  const match = /GHSA-[a-z0-9-]+/i.exec(via?.url ?? '')
  return match ? match[0] : undefined
}

const found = new Map()
for (const vulnerability of Object.values(report.vulnerabilities ?? {})) {
  for (const via of vulnerability.via ?? []) {
    const id = ghsaOf(via)
    if (!id) continue
    if (!found.has(id)) {
      found.set(id, {
        id,
        title: via.title ?? '',
        severity: via.severity ?? vulnerability.severity,
        packages: new Set()
      })
    }
    found.get(id).packages.add(vulnerability.name)
  }
}

const exempt = [...found.keys()].filter((id) => EXEMPT.has(id))
const failing = [...found.values()].filter((entry) => !EXEMPT.has(entry.id))

console.log(`release toolchain: ${found.size} advisory(s)`)
for (const entry of found.values()) {
  const mark = EXEMPT.has(entry.id) ? 'exempt' : 'FAIL  '
  console.log(
    `  ${mark} ${entry.severity.padEnd(8)} ${entry.id}  ${[...entry.packages].join(', ')}`
  )
  console.log(`         ${entry.title}`)
}

// An exemption that is no longer needed should be deleted, not left to rot.
// Aggregated with the failing gate, so an unexempted advisory is never
// masked by a stale-exemption report (or vice versa).
const stale = [...EXEMPT.keys()].filter((id) => !found.has(id))

if (failing.length) {
  console.error(
    `\n${failing.length} advisory(s) in the release toolchain outside the documented exemptions:`
  )
  for (const entry of failing) {
    console.error(`  ${entry.severity} ${entry.id}  ${entry.title}`)
  }
  console.error(
    '\nThe toolchain is not shipped, but it runs with publish credentials. Fix it,\n' +
      'or add it to EXEMPT in release/audit.mjs with the reason it cannot be fixed.'
  )
}

if (stale.length) {
  console.error(
    '\nexempt advisories that no longer appear, so the exemption can go:'
  )
  for (const id of stale) console.error(`  ${id}  ${EXEMPT.get(id)}`)
}

if (failing.length || stale.length) process.exit(1)

console.log(
  `\nno advisory in the release toolchain outside the documented exemptions` +
    (exempt.length ? ` (${exempt.length} exempt)` : '')
)
