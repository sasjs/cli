import { execFileSync } from 'child_process'
import * as path from 'path'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { insertionsUnderDocBlocks } = require('./docblock-diff.cjs')

/**
 * A doc block documents the declaration beneath it. Nothing in the language stops
 * a later edit from inserting a helper between the two, and nothing in the file
 * then looks wrong - the block still describes something, just not what sits
 * under it. That happened four times in one pull request, so the edit is now
 * checked rather than remembered.
 *
 * The rule is about the diff, not the file: an added line whose previous line is
 * an unchanged doc-block terminator means a block was separated from its
 * declaration. Content rules were measured first and rejected - see
 * `docblock-diff.cjs`.
 *
 * What it cannot see: a block and the helper that displaced it, both introduced by
 * the same change, are one addition in the diff - there is no earlier state to
 * compare the block against. That case stays a review catch; this covers an
 * insertion into code the base branch already has, which is the edit that recurs.
 */
const repoRoot = path.resolve(__dirname, '../../../../../..')

describe('doc blocks keep the declaration they document', () => {
  it('reports a line inserted under an existing block', () => {
    const diff = [
      'diff --git a/src/f.js b/src/f.js',
      '--- a/src/f.js',
      '+++ b/src/f.js',
      '@@ -20,3 +20,4 @@',
      ' /**',
      '  * Boots the worker.',
      '  */',
      '+  const helper = () => 1',
      '  const boot = () => {}',
      ''
    ].join('\n')

    expect(insertionsUnderDocBlocks(diff)).toEqual([
      { file: 'b/src/f.js', line: 'const helper = () => 1' }
    ])
  })

  it('leaves a file header and the imports beneath it alone', () => {
    // the opening block of a file is a header - a licence, `@jest-environment`,
    // `istanbul ignore` - and what follows it is the file's own imports. Adding
    // one is ordinary, and fifteen files under src look like this.
    const diff = [
      'diff --git a/src/f.spec.ts b/src/f.spec.ts',
      '--- a/src/f.spec.ts',
      '+++ b/src/f.spec.ts',
      '@@ -1,4 +1,5 @@',
      ' /**',
      '  * @jest-environment jsdom',
      '  */',
      "+import fs from 'fs'",
      " import path from 'path'",
      ''
    ].join('\n')

    expect(insertionsUnderDocBlocks(diff)).toEqual([])
  })

  it('allows a new block added with its own declaration', () => {
    const diff = [
      'diff --git a/src/f.js b/src/f.js',
      '--- a/src/f.js',
      '+++ b/src/f.js',
      '@@ -1,2 +1,6 @@',
      ' const first = () => {}',
      '+/**',
      '+ * Reads the row.',
      '+ */',
      '+const read = () => {}',
      ''
    ].join('\n')

    expect(insertionsUnderDocBlocks(diff)).toEqual([])
  })

  it('allows a block moved with the declaration it documents', () => {
    const diff = [
      'diff --git a/src/f.js b/src/f.js',
      '--- a/src/f.js',
      '+++ b/src/f.js',
      '@@ -1,4 +1,5 @@',
      '-/**',
      '- * Reads the row.',
      '- */',
      '-const read = () => {}',
      '+const helper = () => 1',
      '+/**',
      '+ * Reads the row.',
      '+ */',
      '+const read = () => {}',
      ''
    ].join('\n')

    expect(insertionsUnderDocBlocks(diff)).toEqual([])
  })

  it('does not carry a flag across a hunk boundary', () => {
    const diff = [
      'diff --git a/src/f.js b/src/f.js',
      '--- a/src/f.js',
      '+++ b/src/f.js',
      '@@ -1,3 +1,2 @@',
      ' /**',
      '  * Boots the worker.',
      '  */',
      '@@ -40,0 +41,1 @@',
      '+const later = () => 1',
      ''
    ].join('\n')

    expect(insertionsUnderDocBlocks(diff)).toEqual([])
  })

  it('adds nothing between a block and its declaration on this branch', () => {
    const base = [
      'origin/' + (process.env.GITHUB_BASE_REF || ''),
      'origin/main',
      'main'
    ]
      .filter((ref) => ref !== 'origin/')
      .find((ref) => {
        try {
          execFileSync('git', ['rev-parse', '--verify', '--quiet', ref], {
            cwd: repoRoot,
            stdio: 'ignore'
          })

          return true
        } catch {
          return false
        }
      })

    if (!base) {
      // no history to compare against: a shallow clone with no base branch. The
      // unit-tests job checks out with fetch-depth: 0 so this does not happen in
      // CI, and a local clone normally has main.
      console.warn(
        '[docblocks] no base ref to diff against: fetch one to check this'
      )

      return
    }

    const git = (args: string[]) =>
      execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' })

    // the whole change, working tree included, against the base branch. One
    // context line is enough for the rule to see the terminator above an
    // insertion; with none it would never fire.
    const hits = insertionsUnderDocBlocks(
      git(['diff', '--unified=1', '--no-color', base, '--', 'src'])
    )

    expect(hits).toEqual([])
  })
})
