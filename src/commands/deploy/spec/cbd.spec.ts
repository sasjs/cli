import SASjs from '@sasjs/adapter/node'
import { encode } from 'js-base64'
import {
  ServerType,
  Target,
  generateTimestamp,
  readFile,
  ServiceConfig
} from '@sasjs/utils'
import {
  createTestMinimalApp,
  removeTestApp,
  updateConfig
} from '../../../utils/test'
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

    await updateConfig({
      serviceConfig: {
        serviceFolders: ['sasjs/services/common']
      } as ServiceConfig
    })

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

    expect(sasjs.deployToSASjs).toHaveBeenCalledWith(
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
                      code: encode(
                        `// mock a constant in the pre-existing _webout variable\n_webout = \`\n{"SYSDATE":"21JUN22","SYSTIME":"16:46","areas":[{"AREA":"Adak"},{"AREA":"Adel"},{"AREA":"Afognak"},{"AREA":"Ajo"},{"AREA":"Albany"},{"AREA":"Albuquerque"},{"AREA":"Alturas"},{"AREA":"Ashton"},{"AREA":"Atka"},{"AREA":"Atlanta"},{"AREA":"Attu"},{"AREA":"Aztec"},{"AREA":"Baker"},{"AREA":"Bakersfield"},{"AREA":"Baltimore"},{"AREA":"Beaver"},{"AREA":"Bend"},{"AREA":"Bendeleben"},{"AREA":"Bering Glacier"},{"AREA":"Bettles"},{"AREA":"Bluefield"},{"AREA":"Boise"},{"AREA":"Bozeman"},{"AREA":"Bradfield Cana"},{"AREA":"Brigham City"},{"AREA":"Burns"},{"AREA":"Butte"},{"AREA":"Caliente"},{"AREA":"Candle"},{"AREA":"Canyon City"},{"AREA":"Carlsbad"},{"AREA":"Casper"},{"AREA":"Cedar City"},{"AREA":"Challis"},{"AREA":"Charley River"},{"AREA":"Charlottesvill"},{"AREA":"Chico"},{"AREA":"Chignik"},{"AREA":"Choteau"},{"AREA":"Circle"},{"AREA":"Clifton"},{"AREA":"Cody"},{"AREA":"Cold Bay"},{"AREA":"Concrete"},{"AREA":"Cortez"},{"AREA":"Craig"},{"AREA":"Crescent"},{"AREA":"Cumberland"},{"AREA":"Death Valley"},{"AREA":"Delta"},{"AREA":"Denver"},{"AREA":"Dillon"},{"AREA":"Douglas"},{"AREA":"Driggs"},{"AREA":"Dubois"},{"AREA":"Durango"},{"AREA":"El Centro"},{"AREA":"Elk City"},{"AREA":"Elko"},{"AREA":"Ely"},{"AREA":"Emory Peak"},{"AREA":"Escalante"},{"AREA":"False Pass"},{"AREA":"Fresno"},{"AREA":"Gareloi Island"},{"AREA":"Goldfield"},{"AREA":"Grand Canyon"},{"AREA":"Grangeville"},{"AREA":"Gulkana"},{"AREA":"Hailey"},{"AREA":"Hamilton"},{"AREA":"Hawaii"},{"AREA":"Holbrook"},{"AREA":"Hoquiam"},{"AREA":"Hot Springs"},{"AREA":"Hughes"},{"AREA":"Idaho Falls"},{"AREA":"Iditarod"},{"AREA":"Jordan Valley"},{"AREA":"Ketchikan"},{"AREA":"Kingman"},{"AREA":"Klamath Falls"},{"AREA":"Knoxville"},{"AREA":"Lander"},{"AREA":"Las Cruces"},{"AREA":"Las Vegas"},{"AREA":"Leadville"},{"AREA":"Lewistown"},{"AREA":"Little Rock"},{"AREA":"Livengood"},{"AREA":"Long Beach"},{"AREA":"Los Angeles"},{"AREA":"Lovelock"},{"AREA":"Lukeville"},{"AREA":"Lund"},{"AREA":"Marble Canyon"},{"AREA":"Marfa"},{"AREA":"Mariposa"},{"AREA":"Mcdermitt"},{"AREA":"Medford"},{"AREA":"Melozitna"},{"AREA":"Mesa"},{"AREA":"Millett"},{"AREA":"Moab"},{"AREA":"Montrose"},{"AREA":"Mt. Fairweathe"},{"AREA":"Mt. Katmai"},{"AREA":"Mt. Mckinley"},{"AREA":"Mt. Michelson"},{"AREA":"Needles"},{"AREA":"Nogales"},{"AREA":"Nulato"},{"AREA":"Ogden"},{"AREA":"Okanogan"},{"AREA":"Pendleton"},{"AREA":"Petersburg"},{"AREA":"Phenix City"},{"AREA":"Phoenix"},{"AREA":"Phoenix South"},{"AREA":"Pocatello"},{"AREA":"Poplar Bluff"},{"AREA":"Port Alexander"},{"AREA":"Port Moller"},{"AREA":"Prescott"},{"AREA":"Presidio"},{"AREA":"Preston"},{"AREA":"Price"},{"AREA":"Pueblo"},{"AREA":"Rat Islands"},{"AREA":"Raton"},{"AREA":"Rawlins"},{"AREA":"Redding"},{"AREA":"Reno"},{"AREA":"Richfield"},{"AREA":"Roanoke"},{"AREA":"Roseburg"},{"AREA":"Roundup"},{"AREA":"Ruby"},{"AREA":"Russian Missio"},{"AREA":"Sacramento"},{"AREA":"Saint Johns"},{"AREA":"Salem"},{"AREA":"Salina"},{"AREA":"Salt Lake City"},{"AREA":"Salton Sea"},{"AREA":"Samalga Island"},{"AREA":"San Bernardino"},{"AREA":"San Diego"},{"AREA":"San Francisco"},{"AREA":"San Jose"},{"AREA":"San Luis Obisp"},{"AREA":"Santa Ana"},{"AREA":"Santa Cruz"},{"AREA":"Santa Fe"},{"AREA":"Santa Maria"},{"AREA":"Santa Rosa"},{"AREA":"Seattle"},{"AREA":"Seguam"},{"AREA":"Shungnak"},{"AREA":"Silver City"},{"AREA":"Sitka"},{"AREA":"Sleetmute"},{"AREA":"Socorro"},{"AREA":"Solomon"},{"AREA":"Survey Pass"},{"AREA":"Susanville"},{"AREA":"Tampa"},{"AREA":"Tanana"},{"AREA":"The Dalles"},{"AREA":"Thermopolis"},{"AREA":"Tonopah"},{"AREA":"Tooele"},{"AREA":"Torrington"},{"AREA":"Trinidad"},{"AREA":"Trona"},{"AREA":"Tucson"},{"AREA":"Tularosa"},{"AREA":"Twin Falls"},{"AREA":"Tyonek"},{"AREA":"Ugashik"},{"AREA":"Ukiah"},{"AREA":"Umnak"},{"AREA":"Unalaska"},{"AREA":"Unimak"},{"AREA":"Vancouver"},{"AREA":"Vernal"},{"AREA":"Vya"},{"AREA":"Walker Lake"},{"AREA":"Walla Walla"},{"AREA":"Wallace"},{"AREA":"Weed"},{"AREA":"Wells"},{"AREA":"Wenatchee"},{"AREA":"White Sulphur"},{"AREA":"Williams"},{"AREA":"Winnemucca"},{"AREA":"Yakima"}],\n"SYSUSERID":"sasjs"\n,"MF_GETUSER":"sasjs","_DEBUG":"",\n"_PROGRAM":"/Public/app/minimal-seed-app/services/common/appinit",\n"SYSCC":"0",\n"SYSERRORTEXT":"",\n"SYSHOSTINFOLONG":"",\n"SYSHOSTNAME":"sas",\n"SYSPROCESSID":"41DD607B5567F09E0000000000000000",\n"SYSPROCESSMODE":"Stored Program",\n"SYSPROCESSNAME":"",\n"SYSJOBID":"540520",\n"SYSSCPL":"LINUX",\n"SYSSITE":"0",\n"SYSTCPIPHOSTNAME":"https://sasjs.com",\n"SYSVLONG":"",\n"SYSWARNINGTEXT":"",\n"END_DTTM":"2022-06-21T16:46:40.740543",\n"AUTOEXEC":" ",\n"MEMSIZE":"0KB"}\n\`;\n\nconsole.log(_webout)\n`
                      )
                    },
                    {
                      name: 'appinit',
                      type: 'service',
                      code: removeComments(
                        `${mf_getuser}${mp_jsonout}${ms_webout}${webout}` +
                          '/* provide additional debug info */\n%global _program;\n%put &=syscc;\n%put user=%mf_getuser();\n%put pgm=&_program;\n%put timestamp=%sysfunc(datetime(),datetime19.);\n* Service Variables start;\n* Service Variables end;\n* SAS Macros start;\n* SAS Macros end;\n* SAS Includes start;\n* SAS Includes end;\n* Binary Files start;\n* Binary Files end;\n* Service start;\nproc sql;\ncreate table areas as select distinct area\n  from mydb.springs;\n%webout(OPEN)\n%webout(OBJ,areas)\n%webout(CLOSE)\n* Service end;'
                      )
                    },
                    {
                      name: 'getdata.js',
                      type: 'file',
                      code: encode(
                        `// this file will take input and return a response\n\n_webout = \`\n{"SYSDATE":"21JUN22","SYSTIME":"17:59","springs":[{"LATITUDE":51.925,"LONGITUDE":-177.16,"NAME":"Fumaroles on Kanaga Island","AREA":"Adak","TYPE":"Hotspring","FARENHEIT":219,"CELSIUS":104},{"LATITUDE":52.042,"LONGITUDE":-176.108,"NAME":"Hot Springs on Great Sitkin Island","AREA":"Adak","TYPE":"Hotspring","FARENHEIT":210,"CELSIUS":99},{"LATITUDE":51.81,"LONGITUDE":-177.79,"NAME":"Hot Spring on Tanaga Island","AREA":"Adak","TYPE":"Hotspring","FARENHEIT":null,"CELSIUS":null},{"LATITUDE":51.97,"LONGITUDE":-176.61,"NAME":"Hot Springs on Adak Island","AREA":"Adak","TYPE":"Hotspring","FARENHEIT":154,"CELSIUS":68}],\n"SYSUSERID":"sasjsuser",\n"MF_GETUSER":"SASjs User",\n"_DEBUG":"",\n"_PROGRAM":"/Public/app/minimal-seed-app/services/common/getdata",\n"SYSCC":"0",\n"SYSERRORTEXT":"","SYSHOSTINFOLONG":"","SYSHOSTNAME":"sas",\n"SYSPROCESSID":"41DD607F9C7200B90000000000000000",\n"SYSPROCESSMODE":"Stored Program","SYSPROCESSNAME":"",\n"SYSJOBID":"542908",\n"SYSSCPL":"LINUX","SYSSITE":"0",\n"SYSTCPIPHOSTNAME":"https://sasjs.com",\n"SYSVLONG":"",\n"SYSWARNINGTEXT":"",\n"END_DTTM":"2022-06-21T17:59:14.515731",\n"AUTOEXEC":"","MEMSIZE":"0KB"}\n\`;\n`
                      )
                    },
                    {
                      name: 'getdata',
                      type: 'service',
                      code: removeComments(
                        `${mf_getuser}${mp_jsonout}${ms_webout}${webout}` +
                          '/* provide additional debug info */\n%global _program;\n%put &=syscc;\n%put user=%mf_getuser();\n%put pgm=&_program;\n%put timestamp=%sysfunc(datetime(),datetime19.);\n* Service Variables start;\n* Service Variables end;\n* SAS Macros start;\n* SAS Macros end;\n* SAS Includes start;\n* SAS Includes end;\n* Binary Files start;\n* Binary Files end;\n* Service start;\n%webout(FETCH)\nproc sql;\ncreate table springs as select * from mydb.springs\n  where area in (select area from work.areas);\n%webout(OPEN)\n%webout(OBJ,springs)\n%webout(CLOSE)\n* Service end;'
                      )
                    }
                  ]
                }
              ]
            }
          ]
        }
      },
      undefined,
      undefined
    )
  })
})
