import path from 'path'
import { SASjsApiClient } from '@sasjs/adapter/node'
import { encode } from 'js-base64'
import {
  ServerType,
  Target,
  generateTimestamp,
  readFile,
  ServiceConfig,
  removeHeader
} from '@sasjs/utils'
import {
  createTestMinimalApp,
  removeTestApp,
  updateConfig
} from '../../../utils/test'
import * as utilsModule from '../../../utils/utils'
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
    const deployMock = jest
      .spyOn(SASjsApiClient.prototype, 'deploy')
      .mockImplementation(() =>
        Promise.resolve({
          status: 'success',
          message: 'message'
        })
      )

    jest
      .spyOn(utilsModule, 'isSasJsServerInServerMode')
      .mockImplementation(() => Promise.resolve(false))

    await updateConfig({
      serviceConfig: {
        serviceFolders: ['sasjs/services/common']
      } as ServiceConfig
    })

    await updateLocalTarget(target.name, {
      jobConfig: undefined,
      serviceConfig: undefined,
      deployConfig: {
        deployServicePack: true,
        deployScripts: []
      }
    })

    const { target: customTarget } = await findTargetInConfiguration(
      target.name,
      TargetScope.Local
    )

    await expect(build(customTarget)).toResolve()

    await deploy(customTarget, true)

    const { macroCorePath } = process.sasjsConstants

    // this macro will be in the beginning of the file and this is why file header will be removed
    const mf_getuser = removeHeader(
      await readFile(`${macroCorePath}/base/mf_getuser.sas`)
    )
    const mp_jsonout = await readFile(`${macroCorePath}/base/mp_jsonout.sas`)
    const ms_webout = await readFile(`${macroCorePath}/server/ms_webout.sas`)
    const webout =
      '  %macro webout(action,ds,dslabel=,fmt=,missing=NULL,showmeta=NO,maxobs=MAX);\n' +
      '    %ms_webout(&action,ds=&ds,dslabel=&dslabel,fmt=&fmt\n' +
      '      ,missing=&missing\n' +
      '      ,showmeta=&showmeta\n' +
      '      ,maxobs=&maxobs\n' +
      '    )' +
      '  %mend;\n'

    const mocksPath = path.join(__dirname, appName, 'sasjs', 'mocks')
    const appinitJSPath = path.join(
      mocksPath,
      'services',
      'common',
      'appinit.js'
    )
    const getdataJSPath = path.join(
      mocksPath,
      'services',
      'common',
      'getdata.js'
    )

    const appinitJSContents = await readFile(appinitJSPath)
    const getdataJSContents = await readFile(getdataJSPath)

    const depsInserts = `\n\n* Service Variables start;\n\n\n* Service Variables end;\n* SAS Macros start;\n\n\n\n* SAS Macros end;\n* SAS Includes start;\n\n* SAS Includes end;\n* Binary Files start;\n\n* Binary Files end;\n\n    \n* Service start;\n`
    const appinit = `/**\n  @file appinit.sas\n  @brief Initialisation service - runs on app startup\n  @details  This is always the first service called when the app is opened.\n\n  <h4> SAS Macros </h4>\n\n**/\n\nproc sql;\ncreate table areas as select distinct area\n  from mydb.springs;\n\n%webout(OPEN)\n%webout(OBJ,areas)\n%webout(CLOSE)\n\n`
    const getdata = `/**\n  @file getdata.sas\n  @brief Get Data service - runs on app startup\n  @details  This is always the first service called when the app is opened.\n\n  <h4> SAS Macros </h4>\n\n**/\n\n%webout(FETCH)\n\nproc sql;\ncreate table springs as select * from mydb.springs\n  where area in (select area from work.areas);\n\n%webout(OPEN)\n%webout(OBJ,springs)\n%webout(CLOSE)\n\n`
    const getCode = (file: string) =>
      `${mf_getuser}${mp_jsonout}${ms_webout}${webout}/* provide additional debug info */\n%global _program;\n%put &=syscc;\n%put user=%mf_getuser();\n%put pgm=&_program;\n%put timestamp=%sysfunc(datetime(),datetime19.);${depsInserts}${file}* Service end;`

    expect(deployMock).toHaveBeenCalledWith(
      {
        appLoc: target.appLoc,
        fileTree: {
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
                      name: 'appinit.js',
                      type: 'file',
                      code: encode(appinitJSContents)
                    },
                    {
                      name: 'appinit',
                      type: 'service',
                      code: getCode(appinit)
                    },
                    {
                      name: 'getdata.js',
                      type: 'file',
                      code: encode(getdataJSContents)
                    },
                    {
                      name: 'getdata',
                      type: 'service',
                      code: getCode(getdata)
                    }
                  ]
                }
              ]
            }
          ]
        }
      },
      target.appLoc,
      undefined
    )
  })
})
