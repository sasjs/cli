import { spawnSync } from 'child_process'
import fs from 'fs'
import path from 'path'

import { copy } from '@sasjs/utils'

/**
 * The shell operations the CLI needs, on Node's own APIs.
 *
 * The CLI used shelljs for five things: run a command, copy a folder, remove a
 * file or folder, list entries matching a pattern, and find an executable. Its
 * current release pulls `fast-glob`, which pulls `micromatch`, which pulls
 * `braces` - and `braces` has an unpatched stack-overflow advisory with no
 * fixed release to move to. Nothing here needs a glob engine: the patterns are
 * `*main`, `*master` and `*-main`, matched against one directory.
 *
 * The shapes match what the call sites already expect, so the behaviour they
 * rely on - a command's stdout/stderr/exit code, and `cp -r <dir>/. <dest>`
 * copying a directory's contents rather than the directory - is unchanged.
 */

export interface ShellResult {
  stdout: string
  stderr: string
  code: number
}

/**
 * Runs a command through the platform shell.
 *
 * `silent` decides whether the command's output also reaches this process's
 * streams, which is how shelljs' option of the same name behaved.
 */
export const exec = (
  command: string,
  options: { silent?: boolean } = {}
): ShellResult => {
  const result = spawnSync(command, {
    shell: true,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    // shelljs allowed 20MB of output; spawnSync's 1MB default kills a chatty
    // command mid-run, and a deploy script can easily be chatty.
    maxBuffer: 20 * 1024 * 1024
  })

  const stdout = result.stdout ?? ''
  const stderr = result.stderr ?? ''

  if (!options.silent) {
    if (stdout) process.stdout.write(stdout)
    if (stderr) process.stderr.write(stderr)
  }

  // A killed command leaves status null and reports why on `error` - an
  // exceeded buffer is ENOBUFS. Returning `status ?? 0` for that would report a
  // command that never finished as a success.
  if (result.error) {
    return {
      stdout,
      stderr: [stderr, result.error.message].filter(Boolean).join('\n'),
      code: 1
    }
  }

  return { stdout, stderr, code: result.status ?? 0 }
}

/**
 * Copies the contents of a folder into another folder, matching
 * `cp -r <source>/. <destination>`.
 *
 * @param source - the folder to copy from, addressed as `<dir>/.` so that its
 * contents land directly in the destination.
 * @param destination - the folder to copy into.
 */
export const cp = (source: string, destination: string): Promise<void> =>
  copy(source, destination)

/**
 * Removes files and folders. `recursive` matches `rm -rf`, and without it the
 * call matches `rm -f`. A target containing `*` is expanded first, because
 * shelljs expanded it and the call sites rely on that.
 */
export const rm = (targets: string[], recursive = false): void => {
  for (const target of targets) {
    const resolved = target.includes('*') ? ls(target) : [target]

    for (const entry of resolved) {
      fs.rmSync(entry, { recursive, force: true })
    }
  }
}

/**
 * The entries of one directory whose name matches a pattern.
 *
 * Only `*` is supported, which is all the CLI's patterns use, and the result is
 * addressed the same way the caller's pattern was - `./*main` answers with
 * `./sasjs-react-seed-app-main`.
 */
export const ls = (pattern: string): string[] => {
  const directory = path.dirname(pattern)
  const matcher = new RegExp(
    '^' +
      path
        .basename(pattern)
        .split('*')
        .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('.*') +
      '$'
  )

  let entries: string[]

  try {
    entries = fs.readdirSync(directory)
  } catch {
    return []
  }

  const matches = entries.filter((entry) => matcher.test(entry)).sort()

  // `path.join` would drop the `./`, and the callers pass the result straight
  // to a shell-style path, so the prefix is rebuilt rather than normalised.
  return matches.map((entry) =>
    pattern.startsWith('./') ? `./${entry}` : path.join(directory, entry)
  )
}

/**
 * The path of an executable on this machine, or null when it is not there.
 *
 * POSIX `which`, because that is the only question asked of it: the one caller
 * wants to know whether `wget` is available, and it only asks on Linux. Answer
 * `where` when something needs to ask on Windows - a branch for it now would be
 * unreachable, since the caller has already ruled Windows out.
 */
export const which = (command: string): string | null => {
  const result = spawnSync('which', [command], { encoding: 'utf8' })

  if (result.status !== 0) return null

  const first = (result.stdout ?? '').split('\n')[0].trim()

  return first || null
}
