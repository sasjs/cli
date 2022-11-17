import path from 'path'
import { generateTimestamp, ServerType, Target } from '@sasjs/utils'
import { removeFromGlobalConfig } from '../../../utils/config'
import {
  createTestApp,
  generateTestTarget,
  removeTestApp
} from '../../../utils/test'
import { getDeployScripts } from '../internal/getDeployScripts'

describe('getDeployScripts', () => {
  let target: Target

  beforeEach(async () => {
    const appName = `cli-tests-${generateTimestamp()}`
    await createTestApp(__dirname, appName)
    target = generateTestTarget(
      appName,
      `/Public/app/cli-tests/${appName}`,
      {
        serviceFolders: [path.join('sasjs', 'services')],
        initProgram: '',
        termProgram: '',
        macroVars: {}
      },
      ServerType.Sas9
    )
  })

  afterEach(async () => {
    await removeTestApp(__dirname, target.name)
    await removeFromGlobalConfig(target.name)
  })

  it('should return all deployScripts present at root level of configuration and in target', async () => {
    const scripts = ['script1.sh', 'script2.bat', 'script3.ps1']
    target.deployConfig?.deployScripts.push(...scripts)
    const deployScripts = await getDeployScripts(target)

    expect(deployScripts).toEqual(['sasjs/build/deployscript.sh', ...scripts])
  })
})
