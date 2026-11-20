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

  it('leaves a named re-export under a file header alone', () => {
    // a barrel gains a re-export as readily as a spec gains a dependency
    const diff = [
      'diff --git a/src/index.ts b/src/index.ts',
      '--- a/src/index.ts',
      '+++ b/src/index.ts',
      '@@ -1,3 +1,4 @@',
      ' /**',
      '  * The package surface.',
      '  */',
      "+export { addTarget } from './commands/add/addTarget'",
      " export * from './commands/auth/login'",
      ''
    ].join('\n')

    expect(insertionsUnderDocBlocks(diff)).toEqual([])
  })

  it('leaves a multi-line or typed re-export under a file header alone', () => {
    // the exemption is the statement's opening, not one written form: the members
    // may be inline, on the lines below, or behind `type`
    const multiLine = [
      'diff --git a/src/index.ts b/src/index.ts',
      '--- a/src/index.ts',
      '+++ b/src/index.ts',
      '@@ -1,3 +1,4 @@',
      ' /**',
      '  * The package surface.',
      '  */',
      '+export {',
      '  addTarget',
      "} from './commands/add/addTarget'",
      ''
    ].join('\n')

    const typed = [
      'diff --git a/src/types/index.ts b/src/types/index.ts',
      '--- a/src/types/index.ts',
      '+++ b/src/types/index.ts',
      '@@ -1,3 +1,4 @@',
      ' /**',
      '  * Types.',
      '  */',
      "+export type { Target } from './target'",
      ''
    ].join('\n')

    const aliased = [
      'diff --git a/src/a.ts b/src/a.ts',
      '--- a/src/a.ts',
      '+++ b/src/a.ts',
      '@@ -1,3 +1,4 @@',
      ' /**',
      '  * Surface.',
      '  */',
      "+export * as targets from './target'",
      ''
    ].join('\n')

    // an export that declares is not an import: the boundary of the exemption
    const declared = [
      'diff --git a/src/a.ts b/src/a.ts',
      '--- a/src/a.ts',
      '+++ b/src/a.ts',
      '@@ -1,3 +1,4 @@',
      ' /**',
      '  * Surface.',
      '  */',
      '+export const helper = () => 1',
      ''
    ].join('\n')

    expect(insertionsUnderDocBlocks(multiLine)).toEqual([])
    expect(insertionsUnderDocBlocks(typed)).toEqual([])
    expect(insertionsUnderDocBlocks(aliased)).toEqual([])
    expect(insertionsUnderDocBlocks(declared)).toEqual([
      { file: 'b/src/a.ts', line: 'export const helper = () => 1' }
    ])
  })

  it('reads deleted content that starts with -- as content, not a header', () => {
    // a YAML or SQL comment removed from a file arrives as `-  -- ...`, which is
    // `--- ...` once git prefixes it. Taking that for `--- a/<path>` resets the
    // parser and drops a real insertion.
    const diff = [
      'diff --git a/src/f.yml b/src/f.yml',
      '--- a/src/f.yml',
      '+++ b/src/f.yml',
      '@@ -20,3 +20,3 @@',
      ' /**',
      '  * Boots the worker.',
      '  */',
      '--- an old comment',
      '+  const helper = () => 1',
      ''
    ].join('\n')

    expect(insertionsUnderDocBlocks(diff)).toEqual([
      { file: 'b/src/f.yml', line: 'const helper = () => 1' }
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

    // from the merge base, so a branch that is behind main does not report
    // main's own churn as an insertion; to the working tree, so an uncommitted
    // insertion is caught before it is committed. One context line is enough for
    // the rule to see the terminator above an insertion; with none it never fires.
    const mergeBase = git(['merge-base', base, 'HEAD']).trim()

    const hits = insertionsUnderDocBlocks(
      git(['diff', '--unified=1', '--no-color', mergeBase, '--', 'src'])
    )

    expect(hits).toEqual([])
  })
})
