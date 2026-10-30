import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  compareToBase,
  compareToFloor,
  DEFAULT_TOLERANCE,
  run,
  totals
} from './coverage-ratchet.mjs'

/**
 * The ratchet is a gate, so its own behaviour is worth pinning: a regression
 * that slipped through, or a missing baseline that read as a pass, would be the
 * one failure mode nobody notices until coverage has been falling for months.
 */

const summary = ({ statements, branches, functions, lines }) => ({
  total: {
    statements: { pct: statements },
    branches: { pct: branches },
    functions: { pct: functions },
    lines: { pct: lines }
  }
})

const quiet = async (fn) => {
  const original = { log: console.log, warn: console.warn, error: console.error }
  console.log = console.warn = console.error = () => {}
  try {
    return await fn()
  } finally {
    Object.assign(console, original)
  }
}

test('totals rejects a report with no total entry', () => {
  assert.throws(() => totals({}), /`total` entry/)
  assert.throws(() => totals(null), /`total` entry/)
})

test('a drop beyond the tolerance is a regression', () => {
  const base = totals(summary({ statements: 80, branches: 70, functions: 79, lines: 86 }))
  const head = totals(summary({ statements: 79.5, branches: 70, functions: 79, lines: 86 }))

  const { regressions, rows } = compareToBase(head, base)

  assert.equal(regressions.length, 1)
  assert.equal(regressions[0].metric, 'statements')
  assert.equal(regressions[0].delta, -0.5)
  assert.equal(rows.find((row) => row.metric === 'branches').verdict, 'unchanged')
})

test('a drop inside the tolerance is not a regression', () => {
  const base = totals(summary({ statements: 80, branches: 70, functions: 79, lines: 86 }))
  const head = totals(
    summary({
      statements: 80 - DEFAULT_TOLERANCE,
      branches: 70,
      functions: 79,
      lines: 86
    })
  )

  assert.deepEqual(compareToBase(head, base).regressions, [])
})

test('an improvement passes and is reported as such', () => {
  const base = totals(summary({ statements: 80, branches: 70, functions: 79, lines: 86 }))
  const head = totals(summary({ statements: 81.25, branches: 70, functions: 79, lines: 86 }))

  const { regressions, rows } = compareToBase(head, base)

  assert.deepEqual(regressions, [])
  assert.equal(rows.find((row) => row.metric === 'statements').verdict, 'improved')
})

test('every metric is checked, not just statements', () => {
  const base = totals(summary({ statements: 80, branches: 70, functions: 79, lines: 86 }))
  const head = totals(summary({ statements: 80, branches: 69, functions: 79, lines: 85 }))

  const { regressions } = compareToBase(head, base)

  assert.deepEqual(
    regressions.map((entry) => entry.metric).sort(),
    ['branches', 'lines']
  )
})

test('a metric missing from either report is skipped rather than treated as zero', () => {
  const base = { statements: { pct: 80 } }
  const head = totals(summary({ statements: 80, branches: 70, functions: 79, lines: 86 }))

  const { regressions, rows } = compareToBase(head, base)

  assert.equal(rows.length, 1)
  assert.deepEqual(regressions, [])
})

test('the floor comparison fails only what is below it', () => {
  const head = totals(summary({ statements: 72, branches: 61, functions: 74, lines: 75 }))
  const floor = { statements: 73, branches: 60.55, functions: 73.54, lines: 74 }

  const { failures, rows } = compareToFloor(head, floor)

  assert.deepEqual(
    failures.map((entry) => entry.metric),
    ['statements']
  )
  assert.equal(rows.find((row) => row.metric === 'lines').verdict, 'at or above floor')
})

test('run() fails the job when the base branch has more coverage', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ratchet-'))
  const headPath = path.join(dir, 'head.json')
  const basePath = path.join(dir, 'base.json')

  fs.writeFileSync(headPath, JSON.stringify(summary({ statements: 70, branches: 60, functions: 70, lines: 70 })))
  fs.writeFileSync(basePath, JSON.stringify(summary({ statements: 80, branches: 70, functions: 80, lines: 80 })))

  const code = await quiet(() => run({ head: headPath, base: basePath, tolerance: 0.05, config: 'jest.config.js' }))

  assert.equal(code, 1)
  fs.rmSync(dir, { recursive: true, force: true })
})

test('run() passes when the run matches the base branch', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ratchet-'))
  const headPath = path.join(dir, 'head.json')
  const basePath = path.join(dir, 'base.json')
  const body = JSON.stringify(summary({ statements: 80, branches: 70, functions: 80, lines: 80 }))

  fs.writeFileSync(headPath, body)
  fs.writeFileSync(basePath, body)

  const code = await quiet(() => run({ head: headPath, base: basePath, tolerance: 0.05, config: 'jest.config.js' }))

  assert.equal(code, 0)
  fs.rmSync(dir, { recursive: true, force: true })
})

test('run() falls back to the committed floor when there is no baseline', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ratchet-'))
  const headPath = path.join(dir, 'head.json')
  // a floor that cannot be met, so the fallback path is proven to enforce it
  const configPath = path.join(dir, 'jest.config.js')

  fs.writeFileSync(headPath, JSON.stringify(summary({ statements: 10, branches: 10, functions: 10, lines: 10 })))
  fs.writeFileSync(
    configPath,
    'module.exports = { coverageThreshold: { global: { statements: 73, branches: 60.55, functions: 73.54, lines: 74 } } }\n'
  )

  const code = await quiet(() =>
    run({
      head: headPath,
      base: path.join(dir, 'absent.json'),
      tolerance: 0.05,
      config: configPath
    })
  )

  assert.equal(code, 1)
  fs.rmSync(dir, { recursive: true, force: true })
})

test('run() throws when the run produced no coverage report at all', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ratchet-'))

  await assert.rejects(
    () =>
      quiet(() =>
        run({
          head: path.join(dir, 'absent.json'),
          base: path.join(dir, 'absent.json'),
          tolerance: 0.05,
          config: 'jest.config.js'
        })
      ),
    /ENOENT/
  )

  fs.rmSync(dir, { recursive: true, force: true })
})
