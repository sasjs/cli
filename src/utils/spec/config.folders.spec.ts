import { Target } from '@sasjs/utils'

import {
  getAuthConfigSAS9,
  getBinaryFolders,
  getMacroFolders,
  getProgramFolders,
  getStreamConfig,
  getTestSetUp,
  getTestTearDown
} from '../config'

/**
 * The folder and stream accessors in config.ts read the global configuration
 * `setConstants` writes to `process`, merge the target's own entries over it and
 * resolve everything against the build source folder. None of that was covered:
 * the functions returned whatever the caller's target happened to contain, so a
 * regression in the merge (a dropped target folder, a duplicated path, a
 * relative path that never got resolved) had nothing to fail against.
 */

const buildSourceFolder = '/project/sasjsbuild'

const sas9CredentialsError = 'SAS9 credentials are required.'

const targetWith = (properties: any) => properties as Target

describe('config folder accessors', () => {
  const originalConfig = (process as any).sasjsConfig
  const originalConstants = (process as any).sasjsConstants

  beforeEach(() => {
    ;(process as any).sasjsConfig = {}
    ;(process as any).sasjsConstants = {
      buildSourceFolder,
      sas9CredentialsError
    }
  })

  afterAll(() => {
    ;(process as any).sasjsConfig = originalConfig
    ;(process as any).sasjsConstants = originalConstants
  })

  describe('getProgramFolders', () => {
    it('returns an empty list when neither the config nor the target names a folder', async () => {
      expect(await getProgramFolders(targetWith({}))).toEqual([])
    })

    it('resolves the configuration folders against the build source folder', async () => {
      ;(process as any).sasjsConfig = { programFolders: ['sas'] }

      expect(await getProgramFolders(targetWith({}))).toEqual([
        '/project/sasjsbuild/sas'
      ])
    })

    it("appends the target's own folders after the configuration ones", async () => {
      ;(process as any).sasjsConfig = { programFolders: ['sas'] }

      expect(
        await getProgramFolders(targetWith({ programFolders: ['extra'] }))
      ).toEqual(['/project/sasjsbuild/sas', '/project/sasjsbuild/extra'])
    })

    it('collapses a folder named in both places', async () => {
      ;(process as any).sasjsConfig = { programFolders: ['sas'] }

      expect(
        await getProgramFolders(targetWith({ programFolders: ['sas'] }))
      ).toEqual(['/project/sasjsbuild/sas'])
    })

    it('leaves an absolute folder path alone', async () => {
      ;(process as any).sasjsConfig = { programFolders: ['/somewhere/else'] }

      expect(await getProgramFolders(targetWith({}))).toEqual([
        '/somewhere/else'
      ])
    })
  })

  describe('getBinaryFolders', () => {
    it('returns an empty list with nothing configured', async () => {
      expect(await getBinaryFolders(targetWith({}))).toEqual([])
    })

    it('merges the configuration and target binary folders', async () => {
      ;(process as any).sasjsConfig = { binaryFolders: ['bin'] }

      expect(
        await getBinaryFolders(
          targetWith({ binaryFolders: ['macros/bin', 'bin'] })
        )
      ).toEqual(['/project/sasjsbuild/bin', '/project/sasjsbuild/macros/bin'])
    })
  })

  describe('getMacroFolders', () => {
    it('returns an empty list when no target is given and nothing is configured', async () => {
      expect(await getMacroFolders()).toEqual([])
    })

    it('merges the configuration and target macro folders', async () => {
      ;(process as any).sasjsConfig = { macroFolders: ['macros'] }

      expect(
        await getMacroFolders(targetWith({ macroFolders: ['moremacros'] }))
      ).toEqual(['/project/sasjsbuild/macros', '/project/sasjsbuild/moremacros'])
    })
  })

  describe('getStreamConfig', () => {
    it('defaults the service name when nothing is configured', async () => {
      expect(await getStreamConfig()).toEqual({ streamServiceName: 'clickme' })
    })

    it('takes the configuration stream settings', async () => {
      ;(process as any).sasjsConfig = {
        streamConfig: { streamServiceName: 'from_config', streamWebFolder: 'web' }
      }

      expect(await getStreamConfig()).toEqual({
        streamServiceName: 'from_config',
        streamWebFolder: 'web'
      })
    })

    it("lets the target override the configuration", async () => {
      ;(process as any).sasjsConfig = {
        streamConfig: { streamServiceName: 'from_config' }
      }

      const target = targetWith({
        streamConfig: { streamServiceName: 'from_target' }
      })

      expect(await getStreamConfig(target)).toEqual({
        streamServiceName: 'from_target'
      })
    })
  })

  describe('getAuthConfigSAS9', () => {
    const originalUsername = process.env.SAS_USERNAME
    const originalPassword = process.env.SAS_PASSWORD

    afterEach(() => {
      process.env.SAS_USERNAME = originalUsername
      process.env.SAS_PASSWORD = originalPassword
    })

    it("takes the credentials from the target's authConfigSas9", () => {
      delete process.env.SAS_USERNAME
      delete process.env.SAS_PASSWORD

      const target = targetWith({
        authConfigSas9: { userName: 'target-user', password: 'target-pass' }
      })

      expect(getAuthConfigSAS9(target)).toEqual({
        userName: 'target-user',
        password: 'target-pass'
      })
    })

    it('falls back to the SAS_USERNAME and SAS_PASSWORD environment variables', () => {
      process.env.SAS_USERNAME = 'env-user'
      process.env.SAS_PASSWORD = 'env-pass'

      expect(getAuthConfigSAS9(targetWith({}))).toEqual({
        userName: 'env-user',
        password: 'env-pass'
      })
    })

    it('prefers the target credentials over the environment', () => {
      process.env.SAS_USERNAME = 'env-user'
      process.env.SAS_PASSWORD = 'env-pass'

      const target = targetWith({
        authConfigSas9: { userName: 'target-user', password: 'target-pass' }
      })

      expect(getAuthConfigSAS9(target).userName).toEqual('target-user')
    })

    it('throws the configured error when no credentials exist at all', () => {
      delete process.env.SAS_USERNAME
      delete process.env.SAS_PASSWORD

      expect(() => getAuthConfigSAS9(targetWith({}))).toThrow(
        sas9CredentialsError
      )
    })

    it('throws when only the user name is present', () => {
      process.env.SAS_USERNAME = 'env-user'
      delete process.env.SAS_PASSWORD

      expect(() => getAuthConfigSAS9(targetWith({}))).toThrow(
        sas9CredentialsError
      )
    })
  })

  describe('test hooks', () => {
    it("returns the target's testSetUp without looking at the local config", async () => {
      const target = targetWith({ testConfig: { testSetUp: 'setup.sas' } })

      expect(await getTestSetUp(target)).toEqual('setup.sas')
    })

    it("returns the target's testTearDown without looking at the local config", async () => {
      const target = targetWith({ testConfig: { testTearDown: 'teardown.sas' } })

      expect(await getTestTearDown(target)).toEqual('teardown.sas')
    })
  })
})
