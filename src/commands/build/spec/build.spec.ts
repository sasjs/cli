import { createTestApp, removeTestApp } from '../../../utils/test'
import {
  Logger,
  LogLevel,
  generateTimestamp,
  readFile,
  createFile,
  ServerType
} from '@sasjs/utils'
import { findTargetInConfiguration } from '../../../utils'
import { build, getWebServiceScriptInvocation } from '../build'
import { compile } from '../..'
import path from 'path'

describe('sasjs build', () => {
  let appName: string

  beforeAll(() => {
    process.logger = new Logger(LogLevel.Off)
  })

  afterEach(async () => {
    await removeTestApp(__dirname, appName)
  })

  it(
    `should build with minimal template`,
    async () => {
      appName = `test-app-build-minimal-${generateTimestamp()}`
      await createTestApp(__dirname, appName)
      const target = (await findTargetInConfiguration('viya')).target

      await expect(build(target)).toResolve()
    },
    2 * 60 * 1000
  )

  it(
    `should compile and build(skipping compile)`,
    async () => {
      appName = `test-app-build-${generateTimestamp()}`

      await createTestApp(__dirname, appName)
      const target = (await findTargetInConfiguration('viya')).target

      await compile(target)
      await expect(build(target)).toResolve()
    },
    2 * 60 * 1000
  )

  it(`should compile and build remaining multiline comments`, async () => {
    const beforeComment = 'before comment;'
    const afterComment = 'after comment;'
    const commentLine1 = `/*Name_corrected2=translate(trim(Name_corrected),'_','~!@#$%^&*()+-=[]\{}|;:",./<>?Â°²³µ ');`
    const commentLine2 = `/* Name_corrected2=translate(trim(Name_corrected),'_','/','(',')','?','Â²','#','°C','µ','³'); */`
    const testContent = [
      beforeComment,
      commentLine1,
      commentLine2,
      afterComment
    ].join('\n')

    appName = `test-app-build-${generateTimestamp()}`

    await createTestApp(__dirname, appName)

    const macroPath = path.join(
      __dirname,
      appName,
      'sasjs',
      'macros',
      'examplemacro.sas'
    )

    await createFile(macroPath, (await readFile(macroPath)) + testContent)

    const target = (await findTargetInConfiguration('viya')).target

    await compile(target)
    await build(target)

    const finalSasFilePath = path.join(
      __dirname,
      appName,
      'sasjsbuild',
      target.buildConfig!.buildOutputFileName
    )
    const finalSasFile = await readFile(finalSasFilePath)

    expect(finalSasFile.includes(beforeComment)).toBeTruthy()
    expect(
      finalSasFile.includes(commentLine1.split(`'`).join(`'`.repeat(2)))
    ).toBeTruthy()
    expect(commentLine2.split(`'`).join(`'`.repeat(2))).toBeTruthy()
    expect(finalSasFile.includes(afterComment)).toBeTruthy()
  })
})

describe('getWebServiceScriptInvocation', () => {
  describe(ServerType.SasViya, () => {
    it('should return macro invocation for stored program', () => {
      expect(
        getWebServiceScriptInvocation(ServerType.SasViya, true, false)
      ).toEqual(
        '%mv_createwebservice(path=&appLoc/&path, name=&service, code=sascode,replace=yes)'
      )
    })

    it('should return macro invocation for stored program', () => {
      expect(
        getWebServiceScriptInvocation(ServerType.SasViya, true, true)
      ).toEqual(
        '%mv_createwebservice(path=&appLoc/&path, name=&service, code=sascode,replace=yes)'
      )
    })

    it('should return macro invocation for stored file when encoded is equal to true', () => {
      expect(
        getWebServiceScriptInvocation(ServerType.SasViya, false, true)
      ).toEqual(
        '%mv_createfile(path=&appLoc/&path, name=&filename, inref=filecode, intype=BASE64)'
      )
    })

    it('should return macro invocation for stored file when encoded is equal to true and filename is passed', () => {
      expect(
        getWebServiceScriptInvocation(
          ServerType.SasViya,
          false,
          true,
          'index.js'
        )
      ).toEqual(
        '%mv_createfile(path=&appLoc/&path, name=&filename, inref=filecode, intype=BASE64,swap=compiled_apploc apploc)'
      )
    })
  })

  describe(ServerType.Sas9, () => {
    it('should return macro invocation for stored program', () => {
      expect(
        getWebServiceScriptInvocation(ServerType.Sas9, true, false)
      ).toEqual(
        '%mm_createwebservice(path=&appLoc/&path, name=&service, code=sascode, server=&serverName, replace=yes)'
      )
    })

    it('should return macro invocation for stored program', () => {
      expect(
        getWebServiceScriptInvocation(ServerType.Sas9, true, true)
      ).toEqual(
        '%mm_createwebservice(path=&appLoc/&path, name=&service, code=sascode, server=&serverName, replace=yes)'
      )
    })

    it('should return macro invocation for stored file when encoded is equal to true', () => {
      expect(
        getWebServiceScriptInvocation(ServerType.Sas9, false, true)
      ).toEqual(
        '%mm_createwebservice(path=&appLoc/&path, name=&filename, code=filecode, server=&serverName, replace=yes)'
      )
    })
  })

  describe(ServerType.Sasjs, () => {
    it('should return macro invocation for stored program', () => {
      expect(
        getWebServiceScriptInvocation(ServerType.Sasjs, true, false)
      ).toEqual(
        '%mv_createwebservice(path=&appLoc/&path, name=&service, code=sascode,replace=yes)'
      )
    })

    it('should return macro invocation for stored program', () => {
      expect(
        getWebServiceScriptInvocation(ServerType.Sasjs, true, true)
      ).toEqual(
        '%mv_createwebservice(path=&appLoc/&path, name=&service, code=sascode,replace=yes)'
      )
    })

    it('should return macro invocation for stored file when encoded is equal to true', () => {
      expect(
        getWebServiceScriptInvocation(ServerType.Sasjs, false, true)
      ).toEqual(
        '%mv_createfile(path=&appLoc/&path, name=&filename, inref=filecode, intype=BASE64)'
      )
    })
  })
})
