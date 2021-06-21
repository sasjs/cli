import path from 'path'
import { generateTimestamp, ServerType, Target } from '@sasjs/utils'
import { removeFromGlobalConfig } from '../../../utils/config'
import {
  createTestApp,
  createTestGlobalTarget,
  removeTestApp
} from '../../../utils/test'
import { getDeployScripts } from '../internal/getDeployScripts'
import { getConstants } from '../../../constants'

describe('getDeployScripts', () => {
  let target: Target

  beforeEach(async () => {
    const appName = `cli-tests-${generateTimestamp()}`
    await createTestApp(__dirname, appName)
    target = await createTestGlobalTarget(
      appName,
      `/Public/app/cli-tests/${appName}`,
      undefined,
      ServerType.Sas9
    )
  })

  afterEach(async () => {
    await removeTestApp(__dirname, target.name)
    await removeFromGlobalConfig(target.name)
  })

  it('should include the build output file for SAS9 when deployServicePack is true', async () => {
    target.buildConfig!.buildOutputFileName = 'output-test.sas'
    const deployScripts = await getDeployScripts(target)
    const { buildDestinationFolder } = await getConstants()

    expect(deployScripts).toIncludeAllMembers([
      path.join(buildDestinationFolder, 'output-test.sas')
    ])
  })

  it('should should fallback to target name for the build output file name for SAS9', async () => {
    target.buildConfig!.buildOutputFileName = ''
    const deployScripts = await getDeployScripts(target)
    const { buildDestinationFolder } = await getConstants()

    expect(deployScripts).toIncludeAllMembers([
      path.join(buildDestinationFolder, `${target.name}.sas`)
    ])
  })
})
