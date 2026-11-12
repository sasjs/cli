import fs from 'fs'
import path from 'path'
import { SASjsApiClient } from '@sasjs/adapter/node'
import { encode } from 'js-base64'
import {
  ServerType,
  Target,
  readFile,
  ServiceConfig,
  removeHeader
} from '@sasjs/utils'
import * as fileModule from '@sasjs/utils/file'
import {
  generateUniqueTimestamp,
  createTestMinimalApp,
  removeTestApp,
  updateConfig
} from '../../../utils/test'
import * as utilsModule from '../../../utils/utils'
import { TargetScope } from '../../../types'
import { build } from '../../build/build'
import { compile } from '../../compile/compile'
import { deploy } from '../deploy'
import { createLocalTarget, updateLocalTarget } from './utils'
import {
  findTargetInConfiguration,
  getLocalConfig
} from '../../../utils/config'

/** Every file under a folder, recursively, as absolute paths. */
const listFiles = (folderPath: string): string[] =>
  fs.readdirSync(folderPath, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(folderPath, entry.name)

    return entry.isDirectory() ? listFiles(entryPath) : [entryPath]
  })

describe('sasjs cbd with server type SASJS', () => {
  let target: Target
  let appName: string

  beforeEach(async () => {
    appName = `cli-tests-cbd-sasjs-server-${generateUniqueTimestamp()}`

    await createTestMinimalApp(__dirname, appName)
    target = await createLocalTarget(ServerType.Sasjs)
  })

  afterEach(async () => {
    await removeTestApp(__dirname, appName)

    jest.resetAllMocks()
  })

  it(`should deploy compile and build to sasjs/server`, async () => {
    jest.spyOn(fileModule, 'fileExists').mockImplementation((filePath) => {
      if (filePath.endsWith('.zip')) return Promise.resolve(false)

      return Promise.resolve(true)
    })

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

    process.sasjsConfig = await getLocalConfig()

    const { target: customTarget } = await findTargetInConfiguration(
      target.name,
      TargetScope.Local
    )

    await compile(customTarget)

    await expect(build(customTarget)).toResolve()

    await deploy(customTarget, true)

    const { macroCorePath } = process.sasjsConstants

    // this macro will be in the beginning of the file and this is why file header will be removed
    const mf_getuser = removeHeader(
      await readFile(`${macroCorePath}/base/mf_getuser.sas`)
    )
    const mp_jsonout = await readFile(`${macroCorePath}/base/mp_jsonout.sas`)
    const ms_webout = await readFile(`${macroCorePath}/server/ms_webout.sas`)
    const webout = `%macro webout(action,ds,dslabel=,fmt=,missing=NULL,showmeta=NO,maxobs=MAX);
  %ms_webout(&action,ds=&ds,dslabel=&dslabel,fmt=&fmt
    ,missing=&missing
    ,showmeta=&showmeta
    ,maxobs=&maxobs
  )
%mend;
`

    const depsInserts = `\n\n* Service Variables start;\n\n\n* Service Variables end;\n* SAS Macros start;\n\n\n\n* SAS Macros end;\n* SAS Includes start;\n\n* SAS Includes end;\n* Binary Files start;\n\n* Binary Files end;\n\n\n* Service start;\n`
    const getCode = (file: string) =>
      `${mf_getuser}${mp_jsonout}${ms_webout}${webout}/* provide additional debug info */\n%global _program;\n%put &=syscc;\n%put user=%mf_getuser();\n%put pgm=&_program;\n%put timestamp=%sysfunc(datetime(),datetime19.);${depsInserts}${file}* Service end;`

    // The payload is derived from the project the command created rather than
    // listed by hand. A hand-kept list turned this spec red when the seed app
    // gained a data file beside its services - a file the CLI deploys correctly
    // - so the reference here is the project itself. What stays explicit is the
    // CLI's own contribution: the wrapper, built by `getCode` above.
    expect(deployMock).toHaveBeenCalledTimes(1)

    const [payload] = deployMock.mock.calls[0]
    expect(payload.appLoc).toEqual(target.appLoc)

    const deployed = new Map<string, any>()

    const indexMembers = (members: any[] = [], prefix = '') =>
      members.forEach((member) => {
        const memberPath = prefix ? `${prefix}/${member.name}` : member.name

        if (member.type === 'folder') indexMembers(member.members, memberPath)
        else deployed.set(memberPath, member)
      })

    indexMembers(payload.fileTree.members)

    const projectRoot = path.join(__dirname, appName)
    const mocksRoot = path.join(projectRoot, 'sasjs', 'mocks')

    // every file a service reads beside itself travels with it, base64 encoded
    const mockFiles = listFiles(mocksRoot)

    for (const filePath of mockFiles) {
      const relative = path
        .relative(mocksRoot, filePath)
        .split(path.sep)
        .join('/')

      expect(deployed.get(relative)).toEqual({
        name: path.basename(filePath),
        type: 'file',
        encoding: 'base64',
        code: encode(await readFile(filePath))
      })
    }

    // every program in the configured service folder is a service, wrapped
    const serviceFiles = listFiles(
      path.join(projectRoot, 'sasjs', 'services', 'common')
    ).filter((filePath) => filePath.endsWith('.sas'))

    for (const filePath of serviceFiles) {
      const name = path.basename(filePath, '.sas')
      const contents = await readFile(filePath)

      const member = deployed.get(`services/common/${name}`)

      expect(member).toMatchObject({ name, type: 'service' })
      // the compiled service ends its text with a blank line before the end
      // marker, whatever trailing whitespace the source file carries
      expect(member.code).toEqual(
        getCode(removeHeader(contents).trimEnd() + '\n\n')
      )
    }

    // and nothing else: a member the CLI gains or loses shows as a difference
    // in the count, rather than silently passing inside a hand-written tree
    expect(deployed.size).toEqual(mockFiles.length + serviceFiles.length)
  })
})
