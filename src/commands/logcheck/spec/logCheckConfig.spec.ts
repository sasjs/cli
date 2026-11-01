import path from 'path'
import os from 'os'
import { promises as fs } from 'fs'
import {
  globToRegExp,
  isIgnoredPath,
  matchesPath,
  mergeConfig,
  parseLogCheckSection,
  readLogCheckConfig,
  toPosix
} from '../logCheckConfig'
import { defaultLogCheckConfig } from '../types'

const tempFolder = async () =>
  await fs.mkdtemp(path.join(os.tmpdir(), 'sasjs-logcheck-config-'))

describe('parseLogCheckSection', () => {
  it('returns the defaults when the section is absent', () => {
    expect(parseLogCheckSection(undefined)).toEqual(defaultLogCheckConfig)
    expect(parseLogCheckSection(null)).toEqual(defaultLogCheckConfig)
  })

  it('returns the defaults when the section is empty', () => {
    expect(parseLogCheckSection({})).toEqual(defaultLogCheckConfig)
  })

  it('reads every supported setting', () => {
    const config = parseLogCheckSection({
      failOn: 'warning',
      maxWarnings: 4,
      ignoreCodes: ['49-169'],
      ignorePaths: ['sasjsresults/legacy'],
      folder: 'logs',
      autoCheck: true
    })

    expect(config).toEqual({
      failOn: 'warning',
      maxWarnings: 4,
      ignoreCodes: ['49-169'],
      ignorePaths: ['sasjsresults/legacy'],
      folder: 'logs',
      autoCheck: true
    })
  })

  it('refuses an autoCheck that is not a boolean', () => {
    expect(() => parseLogCheckSection({ autoCheck: 'yes' })).toThrow(
      'must be true or false'
    )
  })

  it('refuses a failOn that is not one of the four policies', () => {
    expect(() => parseLogCheckSection({ failOn: 'warnings' })).toThrow(
      'must be one of error, warning, note, never'
    )
  })

  it('refuses a maxWarnings that is not a whole number of zero or more', () => {
    expect(() => parseLogCheckSection({ maxWarnings: -1 })).toThrow(
      'whole number of zero or more'
    )
    expect(() => parseLogCheckSection({ maxWarnings: 1.5 })).toThrow(
      'whole number of zero or more'
    )
    expect(() => parseLogCheckSection({ maxWarnings: '3' })).toThrow(
      'whole number of zero or more'
    )
  })

  it('refuses a suppressions list that is not an array of strings', () => {
    expect(() => parseLogCheckSection({ ignoreCodes: '49-169' })).toThrow(
      'must be an array of strings'
    )
    expect(() => parseLogCheckSection({ ignorePaths: [1] })).toThrow(
      'must be an array of strings'
    )
  })

  it('refuses an empty folder name', () => {
    expect(() => parseLogCheckSection({ folder: '  ' })).toThrow(
      'must be a non-empty string'
    )
  })

  it('refuses a section that is not an object', () => {
    expect(() => parseLogCheckSection(['failOn'], 'sasjsconfig.json')).toThrow(
      'must be an object'
    )
    expect(() => parseLogCheckSection('error', 'sasjsconfig.json')).toThrow(
      'must be an object'
    )
  })

  it('trims and de-duplicates the suppressions', () => {
    const config = parseLogCheckSection({
      ignoreCodes: [' 49-169 ', '49-169', ''],
      ignorePaths: ['a', 'a']
    })

    expect(config.ignoreCodes).toEqual(['49-169'])
    expect(config.ignorePaths).toEqual(['a'])
  })
})

describe('readLogCheckConfig', () => {
  const originalProjectDir = process.projectDir

  afterEach(() => {
    process.projectDir = originalProjectDir
  })

  const withConfig = async (contents: any) => {
    const folder = await tempFolder()
    process.projectDir = folder

    if (contents !== undefined) {
      await fs.writeFile(
        path.join(folder, 'sasjsconfig.json'),
        typeof contents === 'string' ? contents : JSON.stringify(contents)
      )
    }

    return folder
  }

  it('returns the defaults when the project has no sasjsconfig.json', async () => {
    await withConfig(undefined)

    expect(await readLogCheckConfig()).toEqual(defaultLogCheckConfig)
  })

  it('reads the section from the top level of the config', async () => {
    await withConfig({ logCheck: { failOn: 'note' } })

    expect((await readLogCheckConfig()).failOn).toEqual('note')
  })

  it('reads the section from a wrapped config', async () => {
    await withConfig({ config: { logCheck: { failOn: 'never' } } })

    expect((await readLogCheckConfig()).failOn).toEqual('never')
  })

  it('follows the project results folder a config names', async () => {
    await withConfig({ sasjsResultsFolder: 'build-output/results' })

    expect((await readLogCheckConfig()).folder).toEqual('build-output/results')
  })

  it('prefers the folder the logCheck section names', async () => {
    await withConfig({
      sasjsResultsFolder: 'build-output/results',
      logCheck: { folder: 'logs' }
    })

    expect((await readLogCheckConfig()).folder).toEqual('logs')
  })

  it('fails loudly on a config that is not valid JSON', async () => {
    await withConfig('{ "logCheck": ')

    await expect(readLogCheckConfig()).rejects.toThrow('Could not parse')
  })
})

describe('mergeConfig', () => {
  const base = {
    ...defaultLogCheckConfig,
    ignoreCodes: ['49-169'],
    ignorePaths: ['legacy']
  }

  it('prefers the command line over the file', () => {
    const merged = mergeConfig({ ...base, failOn: 'error' }, { failOn: 'note' })

    expect(merged.failOn).toEqual('note')
  })

  it('returns the config unchanged when there are no overrides', () => {
    expect(mergeConfig({ ...base, failOn: 'note' }).failOn).toEqual('note')
  })

  it('keeps the file value when the flag is absent', () => {
    expect(mergeConfig({ ...base, maxWarnings: 5 }, {}).maxWarnings).toEqual(5)
  })

  it('adds suppressions instead of replacing them', () => {
    const merged = mergeConfig(base, {
      ignoreCodes: ['22-322'],
      ignorePaths: ['build.log']
    })

    expect(merged.ignoreCodes).toEqual(['49-169', '22-322'])
    expect(merged.ignorePaths).toEqual(['legacy', 'build.log'])
  })

  it('does not mutate the config it was given', () => {
    const config = { ...base, ignoreCodes: ['49-169'] }

    mergeConfig(config, { ignoreCodes: ['22-322'] })

    expect(config.ignoreCodes).toEqual(['49-169'])
  })

  it('treats an empty override list as no override', () => {
    expect(mergeConfig(base, { ignoreCodes: [] }).ignoreCodes).toEqual([
      '49-169'
    ])
  })
})

describe('matchesPath', () => {
  it('matches a plain entry as whole path segments', () => {
    expect(
      matchesPath('sasjsresults/legacy/run.log', 'sasjsresults/legacy')
    ).toBe(true)
    expect(matchesPath('sasjsresults/run.log', 'sasjsresults/legacy')).toBe(
      false
    )
    expect(matchesPath('sasjsresults/legacy', 'sasjsresults/legacy')).toBe(true)
  })

  it('does not let a fragment of a name silence a file', () => {
    // The reviewer's case: `test` silencing `latest.log`, and `logs` silencing
    // anything that merely contains it.
    expect(matchesPath('latest.log', 'test')).toBe(false)
    expect(matchesPath('sasjsresults/nested-logs/run.log', 'logs')).toBe(false)
    expect(matchesPath('sasjsresults/run.log', 'run')).toBe(false)
  })

  it('matches at any depth, on a segment boundary', () => {
    expect(matchesPath('test/run.log', 'test')).toBe(true)
    expect(matchesPath('sasjsresults/test/run.log', 'test')).toBe(true)
    expect(matchesPath('sasjsresults/latest-test/run.log', 'test')).toBe(false)
  })

  it('ignores a leading `./` and a trailing separator', () => {
    expect(matchesPath('logs/run.log', './logs/')).toBe(true)
  })

  it('matches a single wildcard without crossing folders', () => {
    expect(matchesPath('sasjsresults/build.log', 'sasjsresults/*.log')).toBe(
      true
    )
    expect(
      matchesPath('sasjsresults/nested/build.log', 'sasjsresults/*.log')
    ).toBe(false)
  })

  it('lets a leading double wildcard match the folder itself', () => {
    expect(matchesPath('build.log', '**/build.log')).toBe(true)
    expect(matchesPath('a/b/build.log', '**/build.log')).toBe(true)
  })

  it('matches a single character wildcard', () => {
    expect(matchesPath('logs/a1.log', 'logs/a?.log')).toBe(true)
    expect(matchesPath('logs/a12.log', 'logs/a?.log')).toBe(false)
  })

  it('ignores an empty pattern', () => {
    expect(matchesPath('sasjsresults/run.log', '   ')).toBe(false)
  })

  it('reads a Windows path the same way as a POSIX one', () => {
    const windowsPath = ['sasjsresults', 'run.log'].join(path.sep)

    expect(matchesPath(windowsPath, 'sasjsresults/run.log')).toBe(true)
  })

  it('reports whether any pattern covers the path', () => {
    expect(isIgnoredPath('a/b.log', ['x', '**/b.log'])).toBe(true)
    expect(isIgnoredPath('a/c.log', ['x', '**/b.log'])).toBe(false)
  })
})

describe('globToRegExp', () => {
  it('escapes the regular-expression characters of a literal pattern', () => {
    expect(globToRegExp('logs/a+b.log').test('logs/a+b.log')).toBe(true)
    expect(globToRegExp('logs/a+b.log').test('logs/aab.log')).toBe(false)
  })

  it('anchors the pattern at both ends', () => {
    expect(globToRegExp('run.log').test('myrun.log')).toBe(false)
  })

  it('treats a double wildcard anywhere as any characters', () => {
    expect(globToRegExp('logs/**/x.log').test('logs/x.log')).toBe(true)
    expect(globToRegExp('logs/**/x.log').test('logs/a/b/x.log')).toBe(true)
  })
})

describe('toPosix', () => {
  it('uses forward slashes on every platform', () => {
    expect(toPosix(['a', 'b.log'].join(path.sep))).toEqual('a/b.log')
  })
})
