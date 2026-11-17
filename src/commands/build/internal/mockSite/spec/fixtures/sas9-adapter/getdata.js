/* Minimal Seed App mock: services/common/getdata
 *
 * The JavaScript twin of getdata.sas, for the builds and deployments that run
 * without SAS. `areas` arrives as an uploaded table (the adapter sends an array
 * of rows as CSV, exactly as it does for the SAS service, where %webout(FETCH)
 * builds work.areas from it), and the answer is the matching rows of the seeded
 * dataset as `springs`.
 *
 * The rows come from springs.json beside this file, which scripts/springs-data.js
 * generates from the dataset's model with a fixed seed - reproducible, and not
 * a copy of the SAS dataset's rows. Change the model there and run that script.
 */

const path = require('path')

/* weboutPath is <root>/sessions/s<n>/webout.txt and the drive sits beside the
 * sessions folder - the layout sasjs/server uses, which the browser host
 * mirrors. The program's own path names the application folder. */
const DRIVE_FILES = path.resolve(weboutPath, '..', '..', '..', 'drive', 'files')
const APP_LOC = String(_program).replace(/\/(services|jobs|tests)\/.*$/, '')
const SPRINGS_FILE = path.join(
  DRIVE_FILES,
  APP_LOC,
  'services',
  'common',
  'springs.json'
)

/* An uploaded table, by name. The host binds one set of _WEBIN_ vars per file:
 * _WEBIN_NAME<n> is the table name, _WEBIN_FILEREF<n> its contents - a string
 * in the browser host, a Buffer on sasjs/server - so both are read as text. */
const getTable = (name) => {
  if (typeof _WEBIN_FILE_COUNT === 'undefined') return ''

  for (let i = 1; i <= _WEBIN_FILE_COUNT; i++) {
    /* direct eval: the _WEBIN_ vars are module-scope consts of the generated
     * program, not properties of globalThis */
    const tableName = eval(
      `typeof _WEBIN_NAME${i} === 'undefined' ? '' : _WEBIN_NAME${i}`
    )
    if (tableName !== name) continue

    return String(eval(`_WEBIN_FILEREF${i}`))
  }

  return ''
}

/* The adapter's table CSV: a header of `name:format.` entries separated by
 * spaces, then one comma separated record per row, values quoted only when they
 * contain a separator or a quote (see convertToCsv in @sasjs/adapter). A quoted
 * value may hold a line break - the adapter leaves an embedded newline in the
 * cell - so a record ends at a line break that arrives OUTSIDE quotes, not at
 * every line break: splitting on lines first would tear that row in two. */
const parseCsv = (csv) => {
  const records = []
  let values = []
  let value = ''
  let quoted = false

  const endRecord = () => {
    values.push(value)
    records.push(values)
    values = []
    value = ''
  }

  const text = String(csv || '')

  for (let i = 0; i < text.length; i++) {
    const char = text[i]

    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        value += '"'
        i++
      } else if (char === '"') {
        quoted = false
      } else {
        value += char
      }
    } else if (char === '"') {
      quoted = true
    } else if (char === ',') {
      values.push(value)
      value = ''
    } else if (char === '\r' || char === '\n') {
      /* CRLF ends one record, not two */
      if (char === '\r' && text[i + 1] === '\n') i++
      if (values.length || value !== '') endRecord()
    } else {
      value += char
    }
  }

  if (values.length || value !== '') endRecord()

  if (records.length < 2) return []

  const columns = records[0]
    .join(' ')
    .trim()
    .split(/\s+/)
    .map((header) => header.replace(/:.*$/, '').toUpperCase())

  return records.slice(1).map((record) => {
    const row = {}

    columns.forEach((column, index) => {
      row[column] = record[index] === undefined ? '' : record[index]
    })

    return row
  })
}

const wanted = new Set(
  parseCsv(getTable('areas')).map((row) => String(row.AREA).trim())
)

/* With no `areas` table the answer is no rows. The SAS service would fail here
 * instead - %webout(FETCH) creates work.areas, and the PROC SQL that follows
 * errors when it was never sent - but an empty answer keeps a demo usable and
 * is what the page draws: no table, no rows. */
const springs = JSON.parse(fs.readFileSync(SPRINGS_FILE, 'utf-8'))

/* proc sql; create table springs as select * from mydb.springs
 *   where area in (select area from work.areas); - dataset order, no sort. */
const rows = springs.filter((row) => wanted.has(row.AREA))

webout('OPEN')
webout('OBJ', 'springs', rows)
webout('CLOSE')
