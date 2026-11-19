/* Run with SASJS_BROWSER_TESTS=1 and CHROMIUM_PATH set; the browser job
 * selects both this independent regression and sas9-adapter.browser.spec.js. */
const { spawnSync } = require('node:child_process')
const path = require('node:path')

const browserTest = process.env.SASJS_BROWSER_TESTS === '1' ? test : test.skip
browserTest(
  'released adapter preserves all numeric missings through mock FETCH and webout',
  () => {
    const result = spawnSync(
      process.execPath,
      [path.join(__dirname, 'missing-adapter.browser.cjs')],
      { encoding: 'utf8', timeout: 120000, env: process.env }
    )
    expect({
      status: result.status,
      error: result.error && String(result.error),
      output: result.stdout + result.stderr
    }).toEqual({
      status: 0,
      error: undefined,
      output: expect.stringContaining(
        'PASS SASJS debug=true: 28 numeric missing states'
      )
    })
  },
  150000
)
