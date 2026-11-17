/* Chromium is opt-in so the ordinary unit suite also runs on hosts without it.
 * CI: SASJS_BROWSER_TESTS=1 CHROMIUM_PATH=/usr/bin/chromium npm exec -- jest --runInBand --coverage=false --runTestsByPath src/commands/build/internal/mockSite/spec/sas9-adapter.browser.spec.js
 */
const { spawnSync } = require('node:child_process')
const path = require('node:path')

const browserTest = process.env.SASJS_BROWSER_TESTS === '1' ? test : test.skip
browserTest(
  'generated SAS9 and SASJS sites run the same multipart mocks in Chromium',
  () => {
    const result = spawnSync(
      process.execPath,
      [path.join(__dirname, 'sas9-adapter.browser.cjs')],
      {
        encoding: 'utf8',
        timeout: 120000,
        env: process.env
      }
    )
    expect({
      status: result.status,
      error: result.error && String(result.error),
      output: result.stdout + result.stderr
    }).toEqual({
      status: 0,
      error: undefined,
      output: expect.stringContaining('PASS SAS9 target / debug=true')
    })
  },
  150000
)
