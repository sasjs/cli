import SASjs from '@sasjs/adapter/node'
import {
  ServerType,
  Target,
  generateTimestamp,
  readFile,
  StreamConfig
} from '@sasjs/utils'
import { createTestMinimalApp, removeTestApp } from '../../../utils/test'
import { TargetScope } from '../../../types'
import { build } from '../../build/build'
import { deploy } from '../deploy'
import { createLocalTarget, updateLocalTarget } from './utils'
import { findTargetInConfiguration } from '../../../utils/config'
import { removeComments } from '../../../utils'

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

    const { macroCorePath } = process.sasjsConstants

    const mf_getuser = await readFile(`${macroCorePath}/base/mf_getuser.sas`)
    const mp_jsonout = await readFile(`${macroCorePath}/base/mp_jsonout.sas`)
    const ms_webout = await readFile(`${macroCorePath}/server/ms_webout.sas`)
    const webout =
      '  %macro webout(action,ds,dslabel=,fmt=,missing=NULL,showmeta=NO);\n' +
      '    %ms_webout(&action,ds=&ds,dslabel=&dslabel,fmt=&fmt\n' +
      '      ,missing=&missing\n' +
      '      ,showmeta=&showmeta\n' +
      '    )' +
      '  %mend;\n'

    const streamConfig: StreamConfig = {
      assetPaths: [],
      streamServiceName: 'clickme',
      streamWeb: false,
      streamWebFolder: '',
      webSourcePath: ''
    }
    expect(sasjs.deployToSASjs).toHaveBeenCalledWith(
      {
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
                    code: removeComments(
                      `${mf_getuser}${mp_jsonout}${ms_webout}${webout}` +
                        '/* provide additional debug info */\n%global _program;\n%put &=syscc;\n%put user=%mf_getuser();\n%put pgm=&_program;\n%put timestamp=%sysfunc(datetime(),datetime19.);\n* Service Variables start;\n* Service Variables end;\n* SAS Macros start;\n* SAS Macros end;\n* SAS Includes start;\n* SAS Includes end;\n* Binary Files start;\n* Binary Files end;\n* Service start;\nproc sql;\ncreate table areas as select distinct area\n  from sashelp.springs;\n%webout(OPEN)\n%webout(OBJ,areas)\n%webout(CLOSE)\n* Service end;'
                    )
                  },
                  {
                    name: 'getdata',
                    type: 'service',
                    code: removeComments(
                      `${mf_getuser}${mp_jsonout}${ms_webout}${webout}` +
                        '/* provide additional debug info */\n%global _program;\n%put &=syscc;\n%put user=%mf_getuser();\n%put pgm=&_program;\n%put timestamp=%sysfunc(datetime(),datetime19.);\n* Service Variables start;\n* Service Variables end;\n* SAS Macros start;\n* SAS Macros end;\n* SAS Includes start;\n* SAS Includes end;\n* Binary Files start;\n* Binary Files end;\n* Service start;\n%webout(FETCH)\nproc sql;\ncreate table springs as select * from sashelp.springs\n  where area in (select area from work.areas);\n%webout(OPEN)\n%webout(OBJ,springs)\n%webout(CLOSE)\n* Service end;'
                    )
                  }
                ]
              }
            ]
          }
        ]
      },
      undefined,
      streamConfig,
      undefined
    )
  })
})
