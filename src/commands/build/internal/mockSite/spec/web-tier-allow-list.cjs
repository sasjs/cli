/* istanbul ignore file - read by the unit suite, not exercised by it: the
 * literal it returns is asserted, the branches inside it are not the subject
 * of any test here, and counting it would put the denominator up for nothing. */
/* The web-tier allow-list the site's worker routes on, read out of the worker
 * itself.
 *
 * Two callers need it and neither may hold a copy: the browser check, because a
 * stub that answers paths the worker refuses would prove the not-found page
 * works in a world the site does not have, and the unit suite, which compares
 * this with the literal in assets/sw.js so the two cannot drift. It lives in
 * its own module so the unit suite can require it without loading the browser
 * harness.
 */
const fs = require('node:fs')
const path = require('node:path')

const SW_PATH = path.join(__dirname, '..', 'assets', 'sw.js')

const allowListLiteral = (source) => {
  const text = source === undefined ? fs.readFileSync(SW_PATH, 'utf8') : source
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

module.exports = { SW_PATH, allowListLiteral }
