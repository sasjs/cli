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

/* FETCH preserves column spelling; SAS column names are case-insensitive. */
const areas = webout('FETCH').areas || []
const wanted = new Set(
  areas.flatMap((row) => {
    const key = Object.keys(row).find((name) => name.toUpperCase() === 'AREA')
    return key === undefined ? [] : [String(row[key]).trim()]
  })
)

/* As before, no areas table gives an empty demo result; the SAS service
 * would instead fail because work.areas was not created. */
const springs = JSON.parse(fs.readFileSync(SPRINGS_FILE, 'utf-8'))

/* proc sql; create table springs as select * from mydb.springs
 *   where area in (select area from work.areas); - dataset order, no sort. */
const rows = springs.filter((row) => wanted.has(row.AREA))

webout('OPEN')
webout('OBJ', 'springs', rows)
webout('CLOSE')
