import fs from 'fs'
import os from 'os'
import path from 'path'
import axios from 'axios'
import { ServerType, Target } from '@sasjs/utils'
import { runSasCode } from '../run'
import * as config from '../../../utils/config'
import * as utils from '../../../utils/utils'
import * as saveLog from '../../../utils/saveLog'
import { setConstants } from '../../../utils/setConstants'

const sasTargets = [ServerType.SasViya, ServerType.Sas9]
const targetFor = (serverType: ServerType) =>
  new Target({ name: 'test', appLoc: '/test', serverType })

describe('run source paths', () => {
  let dir: string
  let oldProjectDir: string
  let oldCurrentDir: string

  beforeEach(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sasjs-run-extension-'))
    oldProjectDir = process.projectDir
    oldCurrentDir = process.currentDir
    process.projectDir = dir
    process.currentDir = dir
    await setConstants(false)
  })

  afterEach(() => {
    process.projectDir = oldProjectDir
    process.currentDir = oldCurrentDir
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it.each(sasTargets)(
    'rejects an existing non-SAS file before executing on %s',
    async (serverType) => {
      fs.writeFileSync(path.join(dir, 'test.sas.txt'), 'data x; run;')
      const executor = jest
        .spyOn(config, 'getSASjsAndAuthConfig')
        .mockRejectedValue(new Error('executor must not be called'))
      await expect(
        runSasCode(targetFor(serverType), 'test.sas.txt')
      ).rejects.toEqual(
        new Error("'sasjs run' command supports only *.sas files.")
      )
      expect(executor).not.toHaveBeenCalled()
    }
  )

  it.each(sasTargets)(
    'rejects a missing non-SAS filename before reading on %s',
    async (serverType) => {
      const executor = jest
        .spyOn(config, 'getSASjsAndAuthConfig')
        .mockRejectedValue(new Error('executor must not be called'))
      await expect(
        runSasCode(targetFor(serverType), 'absent.txt')
      ).rejects.toThrow("'sasjs run' command supports only *.sas files.")
      expect(executor).not.toHaveBeenCalled()
    }
  )

  it.each(sasTargets)(
    'retains ENOENT for a missing .sas on %s',
    async (serverType) => {
      const executor = jest
        .spyOn(config, 'getSASjsAndAuthConfig')
        .mockRejectedValue(new Error('executor must not be called'))
      await expect(
        runSasCode(targetFor(serverType), 'missing.sas')
      ).rejects.toMatchObject({
        code: 'ENOENT'
      })
      expect(executor).not.toHaveBeenCalled()
    }
  )

  it.each(sasTargets)(
    'accepts case-insensitive .sas on %s without changing the actual path',
    async (serverType) => {
      fs.writeFileSync(path.join(dir, 'Program.SAS'), 'data x; run;')
      const stop = new Error('executor boundary reached')
      const executor = jest
        .spyOn(config, 'getSASjsAndAuthConfig')
        .mockRejectedValue(stop)
      const read = jest.spyOn(fs.promises, 'readFile')
      await expect(
        runSasCode(targetFor(serverType), 'Program.SAS')
      ).rejects.toBe(stop)
      expect(executor).toHaveBeenCalledTimes(1)
      expect(read).toHaveBeenCalledWith(path.join(dir, 'Program.SAS'), 'utf8')
      read.mockRestore()
    }
  )

  it('runs unchanged source from an absolute uppercase path inside a dotted directory', async () => {
    const dotted = path.join(dir, 'nested.sas')
    fs.mkdirSync(dotted)
    const file = path.join(dotted, 'Program.SAS')
    fs.writeFileSync(file, 'data x;\r\nrun;')
    const executeScript = jest.fn().mockResolvedValue({ log: 'fixture log' })
    jest.spyOn(config, 'getSASjsAndAuthConfig').mockResolvedValue({
      sasjs: { executeScript, getSasjsConfig: () => ({ contextName: 'test' }) },
      authConfig: {}
    } as any)
    jest.spyOn(saveLog, 'saveLog').mockResolvedValue(undefined as any)
    await expect(
      runSasCode(targetFor(ServerType.SasViya), file)
    ).resolves.toEqual({
      log: 'fixture log'
    })
    expect(executeScript).toHaveBeenCalledWith(
      expect.objectContaining({
        fileName: 'Program.SAS',
        linesOfCode: ['data x;', 'run;']
      })
    )
  })

  it('still sends JavaScript to the SASjs runtime', async () => {
    fs.writeFileSync(path.join(dir, 'job.js'), 'test fixture only')
    const executeScript = jest.fn().mockResolvedValue({ log: 'fixture log' })
    jest.spyOn(config, 'getSASjs').mockReturnValue({ executeScript } as any)
    jest.spyOn(utils, 'isSasJsServerInServerMode').mockResolvedValue(false)
    jest.spyOn(saveLog, 'saveLog').mockResolvedValue(undefined as any)
    await expect(
      runSasCode(targetFor(ServerType.Sasjs), path.join(dir, 'job.js'))
    ).resolves.toEqual({ log: 'fixture log' })
    expect(executeScript).toHaveBeenCalledWith(
      expect.objectContaining({
        linesOfCode: ['test fixture only'],
        runTime: 'js'
      })
    )
  })

  it('fetches an extensionless URL with query as raw source', async () => {
    const url = 'https://example.invalid/program?format=raw'
    const get = jest
      .spyOn(axios, 'get')
      .mockResolvedValue({ data: 'data x; run;' })
    const stop = new Error('executor boundary reached')
    const executor = jest
      .spyOn(config, 'getSASjsAndAuthConfig')
      .mockRejectedValue(stop)
    await expect(runSasCode(targetFor(ServerType.SasViya), url)).rejects.toBe(
      stop
    )
    expect(get).toHaveBeenCalledWith(url)
    expect(executor).toHaveBeenCalledTimes(1)
    expect(fs.readdirSync(dir)).toEqual([])
  })

  it('preserves URL fetch errors, including the original URL', async () => {
    const url = 'https://example.invalid/not-sas.txt?x=1'
    jest
      .spyOn(axios, 'get')
      .mockRejectedValue(new Error('fixture network failure'))
    const executor = jest.spyOn(config, 'getSASjsAndAuthConfig')
    await expect(
      runSasCode(targetFor(ServerType.SasViya), url)
    ).rejects.toThrow(`fixture network failure\nUrl: ${url}`)
    expect(executor).not.toHaveBeenCalled()
  })
})
