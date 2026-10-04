import fs from 'fs'
import os from 'os'
import path from 'path'

import { cp, exec, ls, rm, which } from '../shell'

/**
 * The shell wrapper, directly.
 *
 * Every other suite replaces this module with a mock, so nothing exercised it -
 * which is how the maxBuffer mapping shipped reporting a killed command as a
 * success. These cover the behaviours the call sites rely on: a command's
 * stdout/stderr/exit code, `ls` matching a suffix pattern, `rm` expanding one,
 * and `cp` copying a directory's contents rather than the directory.
 */
describe('shell', () => {
  let root: string

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'sasjs-shell-spec-'))
  })

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true })
  })

  describe('exec', () => {
    it('should answer with stdout and a zero code for a command that succeeds', () => {
      const result = exec(`node -e "process.stdout.write('hello')"`, {
        silent: true
      })

      expect(result.stdout).toEqual('hello')
      expect(result.stderr).toEqual('')
      expect(result.code).toEqual(0)
    })

    it('should answer with the exit code and stderr for a command that fails', () => {
      const result = exec(
        `node -e "process.stderr.write('boom'); process.exit(3)"`,
        { silent: true }
      )

      expect(result.code).toEqual(3)
      expect(result.stderr).toContain('boom')
    })

    it('should report a command killed by the output ceiling as a failure', () => {
      // A command that exceeds maxBuffer is killed, and spawnSync reports that
      // with status null and the reason on `error`. Mapping `status ?? 0` would
      // call it a success, which is what a chatty deploy script would hit.
      const result = exec(
        `node -e "process.stdout.write('x'.repeat(25 * 1024 * 1024))"`,
        { silent: true }
      )

      expect(result.code).not.toEqual(0)
      expect(result.stderr).not.toEqual('')
    })

    it('should keep a command that is merely chatty', () => {
      // 3MB is over spawnSync's 1MB default and under the ceiling this module
      // sets, so the command must finish rather than be killed.
      const result = exec(
        `node -e "process.stdout.write('x'.repeat(3 * 1024 * 1024))"`,
        { silent: true }
      )

      expect(result.code).toEqual(0)
      expect(result.stdout.length).toEqual(3 * 1024 * 1024)
    })
  })

  describe('ls', () => {
    beforeEach(() => {
      fs.mkdirSync(path.join(root, 'sasjs-react-seed-app-main'))
      fs.mkdirSync(path.join(root, 'docs-main'))
      fs.mkdirSync(path.join(root, 'unrelated'))
      fs.writeFileSync(path.join(root, 'main.zip'), '')
    })

    it('should match entries by a suffix pattern', () => {
      expect(ls(path.join(root, '*main')).sort()).toEqual([
        path.join(root, 'docs-main'),
        path.join(root, 'sasjs-react-seed-app-main')
      ])
    })

    it('should match a pattern that narrows the suffix', () => {
      expect(ls(path.join(root, '*-main'))).toEqual([
        path.join(root, 'docs-main'),
        path.join(root, 'sasjs-react-seed-app-main')
      ])
    })

    it('should keep the ./ prefix the caller passed', () => {
      // createApp passes the result straight to a shell-style path, so the
      // prefix survives rather than being normalised away. The pattern is
      // relative, so it resolves against the working directory.
      const cwd = process.cwd()

      try {
        process.chdir(root)

        const matches = ls('./*main')

        expect(matches.sort()).toEqual([
          './docs-main',
          './sasjs-react-seed-app-main'
        ])
      } finally {
        process.chdir(cwd)
      }
    })

    it('should answer with nothing when the directory does not exist', () => {
      expect(ls(path.join(root, 'no-such-dir', '*main'))).toEqual([])
    })

    it('should answer with nothing when nothing matches', () => {
      expect(ls(path.join(root, '*nothing-like-this'))).toEqual([])
    })
  })

  describe('rm', () => {
    it('should expand a pattern before removing', () => {
      fs.mkdirSync(path.join(root, 'sasjs-react-seed-app-main'))
      fs.mkdirSync(path.join(root, 'docs-main'))
      fs.mkdirSync(path.join(root, 'keep-me'))

      rm([path.join(root, '*main')], true)

      expect(fs.existsSync(path.join(root, 'sasjs-react-seed-app-main'))).toBe(
        false
      )
      expect(fs.existsSync(path.join(root, 'docs-main'))).toBe(false)
      expect(fs.existsSync(path.join(root, 'keep-me'))).toBe(true)
    })

    it('should remove a directory and its contents when recursive', () => {
      const target = path.join(root, 'nested')
      fs.mkdirSync(path.join(target, 'deep'), { recursive: true })
      fs.writeFileSync(path.join(target, 'deep', 'file.txt'), 'x')

      rm([target], true)

      expect(fs.existsSync(target)).toBe(false)
    })

    it('should remove a single file', () => {
      const file = path.join(root, 'main.zip')
      fs.writeFileSync(file, '')

      rm([file])

      expect(fs.existsSync(file)).toBe(false)
    })

    it('should not throw for something that is not there', () => {
      expect(() => rm([path.join(root, 'missing')], true)).not.toThrow()
    })
  })

  describe('cp', () => {
    it("should copy a directory's contents into the destination", () => {
      const source = path.join(root, 'sasjs-react-seed-app-main')
      fs.mkdirSync(path.join(source, 'nested'), { recursive: true })
      fs.writeFileSync(path.join(source, 'package.json'), '{}')
      fs.writeFileSync(path.join(source, 'nested', 'file.txt'), 'x')

      const destination = path.join(root, 'my-new-app')
      fs.mkdirSync(destination)

      return cp(`${source}/.`, destination).then(() => {
        // The contents land in the destination, not a folder named after the
        // source - the difference between `cp -r <dir>/. <dest>` and
        // `cp -r <dir> <dest>`, which the create flow depends on.
        expect(fs.existsSync(path.join(destination, 'package.json'))).toBe(true)
        expect(
          fs.existsSync(path.join(destination, 'nested', 'file.txt'))
        ).toBe(true)
        expect(
          fs.existsSync(path.join(destination, 'sasjs-react-seed-app-main'))
        ).toBe(false)
      })
    })
  })

  // `which` answers the POSIX question its one caller asks, and that caller
  // only asks on Linux, so the assertions are Linux-only.
  const describePosix = process.platform === 'win32' ? describe.skip : describe

  describePosix('which', () => {
    it('should answer with the path of an executable that is there', () => {
      expect(which('sh')).toMatch(/sh$/)
    })

    it('should answer with null for one that is not', () => {
      expect(which('definitely-not-a-real-executable-xyz')).toBeNull()
    })
  })
})
