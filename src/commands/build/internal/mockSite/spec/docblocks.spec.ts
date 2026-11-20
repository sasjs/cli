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

  it('leaves a module-scope import under a file header alone', () => {
    // the opening block of a file is a header and what follows it is the file's
    // imports, so adding one is ordinary. The exemption is on the line, not on a
    // line number: sw.js's header closes at :37, far past any figure picked for a
    // number, and the figure would be a header-length trap either way.
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

  it('leaves an importScripts added under a long header alone', () => {
    // the same edit deep in a file, where a block still opens the file: the line
    // number says nothing, the content says it is an import
    const diff = [
      'diff --git a/src/x/sw.js b/src/x/sw.js',
      '--- a/src/x/sw.js',
      '+++ b/src/x/sw.js',
      '@@ -37,2 +37,3 @@',
      '  */',
      "+importScripts('host/extra.js')",
      " importScripts('host/runtime-core.js')",
      ''
    ].join('\n')

    expect(insertionsUnderDocBlocks(diff)).toEqual([])
  })

  it('still reports a declaration inserted under a long header', () => {
    // the exemption is for imports only: a const under the header is the mistake
    const diff = [
      'diff --git a/src/x/sw.js b/src/x/sw.js',
      '--- a/src/x/sw.js',
      '+++ b/src/x/sw.js',
      '@@ -37,2 +37,3 @@',
      '  */',
      '+const helper = () => 1',
      " importScripts('host/runtime-core.js')",
      ''
    ].join('\n')

    expect(insertionsUnderDocBlocks(diff)).toEqual([
      { file: 'b/src/x/sw.js', line: 'const helper = () => 1' }
    ])
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
      // a guard that passes when it cannot run is not a guard. The unit-tests job
      // checks out with fetch-depth: 0 and a local clone has main, so a missing
      // ref is a misconfiguration: fail it, with the remedy in the message
      throw new Error(
        'no base ref to diff against: fetch origin/main (a shallow clone has none)'
      )
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
