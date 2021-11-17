import SASjs from '@sasjs/adapter/node'
import { ServerType, Target, generateTimestamp } from '@sasjs/utils'
import { createTestMinimalApp, removeTestApp } from '../../../utils/test'
import { TargetScope } from '../../../types'
import { build } from '../../build/build'
import { deploy } from '../deploy'
import { createLocalTarget, updateLocalTarget } from './utils'
import { findTargetInConfiguration } from '../../../utils/config'

describe('sasjs cbd with server type SASJS', () => {
  let target: Target
  let appName: string

  beforeEach(async () => {
    appName = `cli-tests-cbd-sasjs-server-${generateTimestamp()}`

    await createTestMinimalApp(__dirname, appName)
    target = await createLocalTarget(ServerType.Sasjs)
  })

  afterEach(async () => {
    await removeTestApp(__dirname, appName)

    jest.resetAllMocks()
  })

  it(`should deploy compile and build to sasjs/server`, async () => {
    const sasjs = new (<jest.Mock<SASjs>>SASjs)()
    jest.mock('@sasjs/adapter')

    jest.spyOn(sasjs, 'deployToSASjs').mockImplementation(() =>
      Promise.resolve({
        status: 'success',
        message: 'message'
      })
    )

    await updateLocalTarget(target.name, {
      jobConfig: undefined,
      serviceConfig: undefined,
      deployConfig: {
        deployServicePack: false,
        deployScripts: [`sasjsbuild/${target.name}.sas`]
      }
    })

    const { target: customTarget } = await findTargetInConfiguration(
      target.name,
      TargetScope.Local
    )

    await expect(build(customTarget)).toResolve()
    await deploy(customTarget, true, sasjs)

    expect(sasjs.deployToSASjs).toHaveBeenCalledWith({
      members: [
        {
          name: 'services',
          type: 'folder',
          members: [
            {
              name: 'common',
              type: 'folder',
              members: [
                {
                  name: 'appinit',
                  type: 'service',
                  code: '/* provide additional debug info */\n%global _program;\n%put &=syscc;\n%put user=%mf_getuser();\n%put pgm=&_program;\n%put timestamp=%sysfunc(datetime(),datetime19.);\n* Service Variables start;\n*Service Variables end;\n* Dependencies start;\n* Dependencies end;\n* Programs start;\n*Programs end;\n* Service start;\nproc sql;\ncreate table areas as select distinct area\n  from sashelp.springs;\n%webout(OPEN)\n%webout(OBJ,areas)\n%webout(CLOSE)\n* Service end;'
                },
                {
                  name: 'getdata',
                  type: 'service',
                  code: '/* provide additional debug info */\n%global _program;\n%put &=syscc;\n%put user=%mf_getuser();\n%put pgm=&_program;\n%put timestamp=%sysfunc(datetime(),datetime19.);\n* Service Variables start;\n*Service Variables end;\n* Dependencies start;\n* Dependencies end;\n* Programs start;\n*Programs end;\n* Service start;\n%webout(FETCH)\nproc sql;\ncreate table springs as select * from sashelp.springs\n  where area in (select area from work.areas);\n%webout(OPEN)\n%webout(OBJ,springs)\n%webout(CLOSE)\n* Service end;'
                }
              ]
            }
          ]
        }
      ]
    })
  })
})