#!/usr/bin/env node

/**
 * Blocks a pull request that lowers coverage, which is the half of the
 * `jest.config.js` threshold nobody wants to maintain by hand.
 *
 * `coverageThreshold.global` in jest.config.js is a floor: a single fixed number
 * that only moves when someone remembers to move it, so it either lags behind
 * real coverage forever or fails an unrelated pull request the moment coverage
 * slips. This script compares the run against the base branch instead - main's
 * latest successful run publishes its `coverage-summary.json` as a workflow
 * artifact, and a pull request downloads it and compares:
 *
 * - any metric more than `--tolerance` below the base figure fails the job;
 * - an improvement passes and is reported, so the effective bar tracks the
 *   repository without a commit;
 * - with no baseline available (the artifact expired, or no run of main has
 *   published one yet) the committed floor is enforced instead, with a warning.
 *   A missing baseline must never read as a pass.
 *
 * A deliberate drop - deleting tested code, or a toolchain upgrade that counts
 * differently - moves `coverageThreshold` in that same PR, where a reviewer sees
 * it. That is the only remaining reason to touch the numbers.
 *
 * usage:
 *   node .github/scripts/coverage-ratchet.mjs \
 *     [--head coverage/coverage-summary.json] \
 *     [--base coverage-base/coverage-summary.json] \
 *     [--tolerance 0.05] [--config jest.config.js]
 */

import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

export const METRICS = ['statements', 'branches', 'functions', 'lines']

/** jest wobbles by a rounding step or two between runs; ignore that much. */
export const DEFAULT_TOLERANCE = 0.05

const round = (value) => Math.round(value * 100) / 100

/** The `total` entry of a jest json-summary report. */
export const totals = (summary) => {
  if (!summary || typeof summary !== 'object' || !summary.total) {
    throw new Error('a coverage summary must carry a `total` entry')
  }
  return summary.total
}

/**
 * Compares two totals. Returns one row per metric, and the subset that fell by
 * more than the tolerance.
 */
export const compareToBase = (head, base, tolerance = DEFAULT_TOLERANCE) => {
  const rows = []
  const regressions = []

  for (const metric of METRICS) {
    const headPct = head[metric] && head[metric].pct
    const basePct = base[metric] && base[metric].pct

    if (typeof headPct !== 'number' || typeof basePct !== 'number') continue

    const delta = round(headPct - basePct)
    const verdict =
      delta < -tolerance ? 'regressed' : delta > tolerance ? 'improved' : 'unchanged'

    rows.push({ metric, base: basePct, head: headPct, delta, verdict })
    if (verdict === 'regressed') {
      regressions.push({ metric, base: basePct, head: headPct, delta })
    }
  }

  return { rows, regressions }
}

/** Compares the run against the committed threshold, for when there is no base. */
export const compareToFloor = (head, floor) => {
  const rows = []
  const failures = []

  for (const metric of METRICS) {
    const headPct = head[metric] && head[metric].pct
    const floorPct = floor && floor[metric]

    if (typeof headPct !== 'number' || typeof floorPct !== 'number') continue

    const verdict = headPct < floorPct ? 'under floor' : 'at or above floor'
    rows.push({ metric, base: floorPct, head: headPct, delta: round(headPct - floorPct), verdict })
    if (verdict === 'under floor') {
      failures.push({ metric, floor: floorPct, head: headPct })
    }
  }

  return { rows, failures }
}

export const readSummary = (file) => JSON.parse(fs.readFileSync(file, 'utf8'))

const loadFloor = async (configPath) => {
  const module = await import(pathToFileURL(path.resolve(configPath)).href)
  const config = module.default || module
  const threshold = config.coverageThreshold && config.coverageThreshold.global

  if (!threshold) {
    throw new Error(`${configPath} has no coverageThreshold.global to fall back on`)
  }

  return threshold
}

const printRows = (rows) => {
  const width = Math.max(...rows.map((row) => row.metric.length), 8)
  for (const row of rows) {
    const delta = `${row.delta > 0 ? '+' : ''}${row.delta}`
    console.log(
      `  ${row.metric.padEnd(width)}  base ${String(row.base).padStart(6)}  head ${String(row.head).padStart(6)}  ${delta.padStart(7)}  ${row.verdict}`
    )
  }
}

const parseArgs = (argv) => {
  const options = {
    head: 'coverage/coverage-summary.json',
    base: 'coverage-base/coverage-summary.json',
    tolerance: DEFAULT_TOLERANCE,
    config: 'jest.config.js'
  }

  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index].replace(/^--/, '')
    const value = argv[index + 1]
    if (!(key in options)) throw new Error(`unknown option --${key}`)

    options[key] = key === 'tolerance' ? Number(value) : value
  }

  if (Number.isNaN(options.tolerance)) throw new Error('--tolerance must be a number')

  return options
}

export const run = async (options) => {
  const head = totals(readSummary(options.head))

  console.log('Coverage ratchet')

  if (fs.existsSync(options.base)) {
    const base = totals(readSummary(options.base))
    const { rows, regressions } = compareToBase(head, base, options.tolerance)
    printRows(rows)

    if (regressions.length) {
      console.error(
        `\n${regressions.length} metric(s) below the base branch by more than ${options.tolerance}pt:`
      )
      for (const entry of regressions) {
        console.error(`  ${entry.metric}: ${entry.base}% -> ${entry.head}% (${entry.delta})`)
      }
      console.error(
        '\nCoverage may not go backwards. Add tests for the code that lost it. If the drop is intended - deleted code, or a toolchain upgrade that counts differently - lower coverageThreshold in jest.config.js in this pull request and say why.'
      )
      return 1
    }

    console.log('\nNo metric is below the base branch.')
    return 0
  }

  console.warn(
    `\nNo baseline at ${options.base} (the artifact expires after 90 days, and main only publishes one after this workflow runs there). Falling back to coverageThreshold in ${options.config}.`
  )

  const floor = await loadFloor(options.config)
  const { rows, failures } = compareToFloor(head, floor)
  printRows(rows)

  if (failures.length) {
    console.error(`\n${failures.length} metric(s) under the committed floor:`)
    for (const entry of failures) {
      console.error(`  ${entry.metric}: floor ${entry.floor}%, coverage ${entry.head}%`)
    }
    return 1
  }

  console.log('\nEvery metric is at or above the committed floor.')
  return 0
}

const main = async () => {
  try {
    const options = parseArgs(process.argv.slice(2))
    process.exitCode = await run(options)
  } catch (error) {
    console.error(`coverage-ratchet: ${error.message}`)
    process.exitCode = 2
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
