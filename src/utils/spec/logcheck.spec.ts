import os from 'os'
import path from 'path'
import { promises as fs } from 'fs'
import { Logger, LogLevel } from '@sasjs/utils'
import {
  checkLog,
  getLogCheckMode,
  isLogCheckFailure,
  logCheckModeOf,
  setLogCheckMode,
  LogCheckFailure
} from '../logcheck'

const sasLog = (extra: string = '') =>
  `NOTE: Copyright (c) 2016 by SAS Institute Inc., Cary, NC, USA.

1    data work.x;
2      set work.y;
3    run;
${extra}`

const logWithError = sasLog('ERROR 22-322: Syntax error.\n')
const logWithNote = sasLog('NOTE: Variable flag is uninitialized.\n')
const cleanLog = sasLog()

const tempFolder = async () =>
  await fs.mkdtemp(path.join(os.tmpdir(), 'sasjs-logcheck-inline-'))

describe('logCheckModeOf', () => {
  it('reads the tri-state a yargs boolean gives', () => {
    expect(logCheckModeOf(true)).toEqual('on')
    expect(logCheckModeOf(false)).toEqual('off')
    expect(logCheckModeOf(undefined)).toEqual('auto')
  })
})

describe('checkLog', () => {
  const originalProjectDir = process.projectDir
  let logged: string[]

  const withProject = async (logCheck?: object) => {
    const folder = await tempFolder()
    process.projectDir = folder

    if (logCheck !== undefined) {
      await fs.writeFile(
        path.join(folder, 'sasjsconfig.json'),
        JSON.stringify({ logCheck })
      )
    }

    return folder
  }

  beforeEach(() => {
    logged = []
    process.logger = {
      log: (message: string) => logged.push(message)
    } as unknown as Logger
    process.logger.logLevel = LogLevel.Off
  })

  afterEach(() => {
    process.projectDir = originalProjectDir
    process.logger = undefined as unknown as Logger
    setLogCheckMode('auto')
  })

  it('says nothing for a clean log', async () => {
    await withProject()

    await checkLog(cleanLog, 'run-job.sas')

    expect(logged).toEqual([])
  })

  it('says nothing when it is given no log at all', async () => {
    await withProject()

    await checkLog(undefined, 'run-job.sas')

    expect(logged).toEqual([])
  })

  it('reports the issues without failing by default', async () => {
    await withProject()

    await checkLog(logWithError, 'run-job.sas')

    const output = logged.join('\n')

    expect(output).toContain('SAS log check run-job.sas')
    expect(output).toContain('1 error')
    expect(output).toContain('Syntax error.')
    expect(output).not.toContain('Logcheck failed')
  })

  it('skips the check, with a warning, when the config cannot be read', async () => {
    const folder = await tempFolder()
    process.projectDir = folder
    await fs.writeFile(path.join(folder, 'sasjsconfig.json'), '{ "logCheck": ')
    const warn = jest.fn()
    ;(process.logger as any).warn = warn

    await checkLog(logWithError, 'run-job.sas')

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('Skipping the SAS log check')
    )
    expect(logged).toEqual([])
  })

  it('says nothing at all under --no-logcheck', async () => {
    await withProject({ autoCheck: true })
    setLogCheckMode('off')

    await checkLog(logWithError, 'run-job.sas')

    expect(logged).toEqual([])
  })

  it('fails the run when the project asked for it', async () => {
    await withProject({ autoCheck: true })

    await expect(checkLog(logWithError, 'run-job.sas')).rejects.toThrow(
      'SAS log check failed for run-job.sas: 1 error'
    )
    expect(logged.join('\n')).toContain('Logcheck failed: 1 error')
  })

  it('fails the run when the flag asked for it, without the config', async () => {
    await withProject()
    setLogCheckMode('on')

    await expect(checkLog(logWithError, 'run-job.sas')).rejects.toBeInstanceOf(
      LogCheckFailure
    )
  })

  it('does not fail on a note under the default policy', async () => {
    await withProject({ autoCheck: true })

    await checkLog(logWithNote, 'run-job.sas')

    expect(logged.join('\n')).toContain('1 note')
    expect(logged.join('\n')).not.toContain('Logcheck failed')
  })

  it('fails on a note when the policy says note', async () => {
    await withProject({ autoCheck: true, failOn: 'note' })

    await expect(checkLog(logWithNote, 'run-job.sas')).rejects.toThrow('1 note')
  })

  it('suppresses an issue by message code', async () => {
    await withProject({ ignoreCodes: ['22-322'] })

    await checkLog(logWithError, 'run-job.sas')

    expect(logged).toEqual([])
  })

  it('reports a suppressed issue alongside the ones that remain', async () => {
    await withProject({ ignoreCodes: ['22-322'], autoCheck: true })

    await checkLog(
      sasLog(
        'ERROR 22-322: Syntax error.\nNOTE: Variable flag is uninitialized.\n'
      ),
      'run-job.sas'
    ).catch(() => undefined)

    const output = logged.join('\n')

    expect(output).toContain('1 note')
    expect(output).toContain('1 issue suppressed by message code (22-322)')
    expect(output).not.toContain('Logcheck failed')
  })
})

describe('isLogCheckFailure', () => {
  it('recognises only its own error', () => {
    expect(isLogCheckFailure(new LogCheckFailure('x'))).toBe(true)
    expect(isLogCheckFailure(new Error('x'))).toBe(false)
    expect(isLogCheckFailure('x')).toBe(false)
    expect(isLogCheckFailure(undefined)).toBe(false)
  })

  it('is not fooled by an error that only borrows the name', () => {
    // The marker is what the built CLI relies on: the compiled target loses the
    // prototype chain of an Error subclass, so `instanceof` is not available
    // there and the name alone would be a weak claim.
    const impostor = new Error('x')
    impostor.name = 'LogCheckFailure'

    expect(isLogCheckFailure(impostor)).toBe(false)
  })
})

describe('getLogCheckMode', () => {
  afterEach(() => setLogCheckMode('auto'))

  it('starts on auto and follows what it is set to', () => {
    expect(getLogCheckMode()).toEqual('auto')

    setLogCheckMode('on')
    expect(getLogCheckMode()).toEqual('on')

    setLogCheckMode('off')
    expect(getLogCheckMode()).toEqual('off')
  })
})
