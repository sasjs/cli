import { spawnSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'

describe('simulated Viya job failures through real CLI code', () => {
  it.each([
    ['resolve', 'links', 'wait', 'no-status', 'wrapped'],
    ['resolve', 'no-links', 'no-wait', 'no-status', 'direct'],
    ['reject', 'links', 'wait', 'no-status', 'direct'],
    ['reject', 'no-links', 'no-wait', 'no-status', 'direct'],
    ['resolve', 'links', 'wait', 'status', 'direct'],
    ['resolve', 'no-links', 'no-wait', 'status', 'wrapped']
  ])(
    'reports failure: %s, %s, %s, %s, %s',
    (outcome, links, wait, status, shape) => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'job-diagnostic-test-'))
      try {
        const child = spawnSync(
          process.execPath,
          [
            path.join(__dirname, 'fixtures/simulated-job-exit.cjs'),
            dir,
            'command',
            outcome,
            links,
            wait,
            'capture',
            status,
            shape
          ],
          {
            cwd: process.cwd(),
            env: {
              PATH: process.env.PATH,
              HOME: dir,
              TMPDIR: dir,
              DISABLE_V8_COMPILE_CACHE: '1',
              TS_NODE_PROJECT: path.join(process.cwd(), 'tsconfig.json')
            },
            encoding: 'utf8',
            timeout: 30000
          }
        )
        expect(child.error).toBeUndefined()
        expect(child.status).toBe(2)
        expect(child.stderr).toMatch(/failed/i)
        expect(child.stderr.match(/failed/gi)).toHaveLength(1)
        if (status === 'no-status') {
          expect(fs.existsSync(path.join(dir, 'status.txt'))).toBe(false)
        } else {
          expect(fs.readFileSync(path.join(dir, 'status.txt'), 'utf8')).toBe(
            'Job Status: failed'
          )
        }
      } finally {
        fs.rmSync(dir, { recursive: true, force: true })
      }
    }
  )

  it.each([
    ['executor', 'reject', 'links', 'wait'],
    ['command', 'reject', 'links', 'wait'],
    ['command', 'reject', 'links', 'no-wait'],
    ['command', 'resolve', 'links', 'wait'],
    ['command', 'resolve', 'no-links', 'no-wait']
  ])(
    '%s with %s, %s, %s exits with error and records failed status',
    (caller, outcome, links, wait) => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'job-failed-test-'))
      try {
        const child = spawnSync(
          process.execPath,
          [
            path.join(__dirname, 'fixtures/simulated-job-exit.cjs'),
            dir,
            caller,
            outcome,
            links,
            wait
          ],
          {
            cwd: process.cwd(),
            env: {
              PATH: process.env.PATH,
              HOME: dir,
              TMPDIR: dir,
              DISABLE_V8_COMPILE_CACHE: '1',
              TS_NODE_PROJECT: path.join(process.cwd(), 'tsconfig.json')
            },
            encoding: 'utf8',
            timeout: 30000
          }
        )
        expect(child.error).toBeUndefined()
        expect({ status: child.status, stderr: child.stderr }).toEqual({
          status: 2,
          stderr: ''
        })
        expect(fs.readFileSync(path.join(dir, 'status.txt'), 'utf8')).toBe(
          'Job Status: failed'
        )
        if (links === 'links') {
          expect(
            JSON.parse(fs.readFileSync(path.join(dir, 'output.json'), 'utf8'))
              .state
          ).toBe('failed')
          if (caller === 'executor') {
            expect(fs.readFileSync(path.join(dir, 'job.log'), 'utf8')).toBe(
              'SIMULATED log\n'
            )
          }
        }
      } finally {
        fs.rmSync(dir, { recursive: true, force: true })
      }
    }
  )
})
