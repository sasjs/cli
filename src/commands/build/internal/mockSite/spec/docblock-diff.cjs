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
 * The lines a diff inserts directly under an existing doc block.
 *
 * `diffText` is `git diff --unified=1 --no-color` output: **one context line is
 * required**, because with none the terminator above an insertion never appears
 * in the diff and the rule returns nothing at all - a gate that always passes.
 * Each hit is reported with the file it belongs to and the text that was
 * inserted.
 */
const insertionsUnderDocBlocks = (diffText) => {
  // a block ending this close to the top of a file is a file header - a licence,
  // `@jest-environment`, `istanbul ignore` - and the code beneath it is the file's
  // own imports, not a declaration the block documents. Adding an import there is
  // ordinary, so the rule stays out of it.
  const HEADER_LINES = 5

  const hits = []
  let file = ''
  let newLine = null
  // the previous line in the NEW file, as { added, text, header } - `added`
  // decides whether inserting under it is a mistake or part of a new block, and
  // `header` whether it is a file header rather than a declaration's doc block
  let previous = null

  const push = (line) => {
    file = line.slice(4).trim()
    previous = null
  }

  for (const line of diffText.split('\n')) {
    if (line.startsWith('+++ ')) {
      push(line)
      continue
    }

    // `--- a/x`, `diff --git`, `index ...` and the hunk header say nothing about
    // what the new file holds where the hunk starts
    if (line.startsWith('@@')) {
      const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)/.exec(line)

      newLine = hunk ? Number(hunk[1]) : null
      previous = null
      continue
    }

    if (
      line.startsWith('---') ||
      line.startsWith('diff ') ||
      line.startsWith('index ')
    ) {
      previous = null
      continue
    }

    if (line.startsWith('+')) {
      const text = line.slice(1)

      if (
        previous &&
        !previous.added &&
        !previous.header &&
        previous.text.trim() === '*/'
      )
        hits.push({ file, line: text.trim() })

      previous = { added: true, text, header: false }
      if (newLine !== null) newLine++
      continue
    }

    if (line.startsWith('-')) continue

    if (line.startsWith(' ')) {
      previous = {
        added: false,
        text: line.slice(1),
        header: newLine !== null && newLine <= HEADER_LINES
      }
      if (newLine !== null) newLine++
    }
  }

  return hits
}

module.exports = { insertionsUnderDocBlocks }
