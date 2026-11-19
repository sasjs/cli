/* istanbul ignore file -- browser harness support, not unit-test coverage */
/* Read the site's web-tier allow-list directly from its worker, so the browser
 * stub does not route on a separate copy. */
const fs = require('node:fs')
const path = require('node:path')

const SW_PATH = path.join(__dirname, '..', 'assets', 'sw.js')

const allowListLiteral = () => {
  const text = fs.readFileSync(SW_PATH, 'utf8')
  const matches = text.match(/\/\^\\\/\([^)]*\)\(\\\/\|\$\)\/i/g) || []
  /* the worker carries more than one allow-list; the web tiers are named in
   * this one */
  const found = matches.find((literal) => literal.includes('StoredProgram'))
  if (!found)
    throw new Error(
      'assets/sw.js no longer carries the web-tier allow-list (the literal naming StoredProgram)'
    )
  return found
}

module.exports = { allowListLiteral }
