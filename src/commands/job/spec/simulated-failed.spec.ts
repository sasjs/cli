import { spawnSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'

describe('simulated Viya job failures through real CLI code', () => {
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
