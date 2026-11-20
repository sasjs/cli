/* istanbul ignore file -- diff support, exercised by docblocks.spec.ts */
/**
 * The one mechanical way a doc block loses its declaration.
 *
 * A block is written for the declaration beneath it. Inserting a helper between
 * them is a mistake no reader of the file can detect - the block still parses,
 * still describes *something* - and it has cost this repository four review
 * rounds in a single pull request. Content rules do not work: the house style
 * describes behaviour rather than naming the identifier (97 of 103 blocks in the
 * mock-site assets never name theirs), and "a block that names an identifier must
 * be followed by it" flags 14 of 96, nearly all false.
 *
 * The edit itself is decidable, though: an ADDED line whose previous line in the
 * new file is an UNCHANGED doc-block terminator. Adding a whole block with its
 * declaration is not flagged, because there the terminator is added too.
 */

/**
 * An import or a re-export is not the declaration a doc block documents.
 *
 * The block at the top of a file is a header - a licence, `@jest-environment`,
 * `istanbul ignore` - and what sits beneath it is the file's imports, so adding
 * one is an ordinary edit: a spec gains a dependency, a worker gains a script, a
 * barrel gains a re-export. Exempting the line rather than a line number is what
 * covers headers of any length; `sw.js`'s closes at :37.
 *
 * A re-export is matched by how its statement opens, not by one written form: the
 * members may be inline, on following lines, or behind `type`/`as`. `export const`
 * is a declaration and stays reportable.
 */
const MODULE_IMPORT =
  /^(?:import\b|import\s*\(|importScripts\s*\(|(?:const|let|var)\s+[^=]+=\s*require\s*\(|export\s*(?:\*|\{|type\s*\{))/

const isModuleImport = (text) => MODULE_IMPORT.test(text.trim())

/**
 * The lines a diff inserts directly under an existing doc block.
 *
 * `diffText` is a `git diff --unified=1 --no-color` run from the merge base:
 * **one context line is required**, because with none the terminator above an
 * insertion never appears in the diff and the rule returns nothing at all - a
 * gate that always passes. Each hit is reported with the file it belongs to and
 * the text that was inserted.
 *
 * Header lines are recognised only between `diff --git` and the first `@@`, which
 * keeps a deleted line whose content begins with `--` (a YAML or SQL comment)
 * from being read as a `--- a/<path>` header.
 */
const insertionsUnderDocBlocks = (diffText) => {
  const hits = []
  let file = ''
  let inHeader = false
  // the previous line in the NEW file, as { added, text } - `added` decides
  // whether inserting under it is a mistake or part of a new block
  let previous = null

  for (const line of diffText.split('\n')) {
    if (line.startsWith('diff --git')) {
      inHeader = true
      previous = null
      continue
    }

    if (inHeader && line.startsWith('+++ ')) {
      file = line.slice(4).trim()
      continue
    }

    if (line.startsWith('@@')) {
      inHeader = false
      previous = null
      continue
    }

    if (inHeader) continue

    if (line.startsWith('+')) {
      const text = line.slice(1)

      if (
        previous &&
        !previous.added &&
        previous.text.trim() === '*/' &&
        !isModuleImport(text)
      )
        hits.push({ file, line: text.trim() })

      previous = { added: true, text }
      continue
    }

    if (line.startsWith('-')) continue

    if (line.startsWith(' ')) previous = { added: false, text: line.slice(1) }
  }

  return hits
}

module.exports = { insertionsUnderDocBlocks }
