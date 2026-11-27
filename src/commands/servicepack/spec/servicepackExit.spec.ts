import { spawnSync } from 'child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import os from 'os'
import path from 'path'
import { ReturnCode } from '../../../types/command'

describe('servicepack deploy process exit', () => {
  let projectDir: string

  beforeEach(() => {
    projectDir = mkdtempSync(path.join(os.tmpdir(), 'servicepack-exit-'))
    mkdirSync(path.join(projectDir, 'sasjs'))
    writeFileSync(
      path.join(projectDir, 'sasjs', 'sasjsconfig.json'),
      JSON.stringify({
        defaultTarget: 'test',
        targets: [
          {
            name: 'test',
            serverType: 'SASVIYA',
            serverUrl: 'http://127.0.0.1:1',
            appLoc: '/Public/test'
          }
        ]
      })
    )
    writeFileSync(
      path.join(projectDir, 'pack.json'),
      JSON.stringify({ name: 'services', type: 'folder', members: [] })
    )
  })

  afterEach(() => rmSync(projectDir, { recursive: true, force: true }))

  const run = (failure: boolean) =>
    spawnSync(
      process.execPath,
      [
        '-r',
        require.resolve('ts-node/register/transpile-only'),
        path.join(__dirname, 'servicepackExit.fixture.cjs'),
        'servicepack',
        'deploy',
        '-s',
        'pack.json',
        '-t',
        'test'
      ],
      {
        cwd: projectDir,
        env: {
          ...process.env,
          HOME: projectDir,
          LOG_LEVEL: 'Info',
          CONSOLA_LEVEL: '4',
          SASJS_CLI_TEST_ROOT: process.cwd(),
          TS_NODE_PROJECT: path.join(process.cwd(), 'tsconfig.json'),
          SASJS_CLI_TEST_FAILURE: failure ? '1' : '0'
        },
        encoding: 'utf8',
        timeout: 30000
      }
    )

  it('exits nonzero when the remote deploy fails and the helper returns false', () => {
    const result = run(true)
    const output = result.stdout + result.stderr
    expect(output).toContain('Servicepack deploy failed.')
    expect(output).toContain('deployServicePack error')
    expect(output).not.toContain('Servicepack successfully deployed!')
    expect(result.status).toBe(ReturnCode.InternalError)
  })

  it('exits zero when the remote deploy succeeds', () => {
    const result = run(false)
    const output = result.stdout + result.stderr
    expect(result.error).toBeUndefined()
    expect(result.signal).toBeNull()
    expect(output).toContain('Servicepack successfully deployed!')
    expect(result.status).toBe(ReturnCode.Success)
  })
})
