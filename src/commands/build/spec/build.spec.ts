import {
  createTestApp,
  removeTestApp,
  generateUniqueTimestamp
} from '../../../utils/test'
import {
  Logger,
  LogLevel,
  readFile,
  createFile,
  createFolder,
  folderExists,
  deleteFolder,
  ServerType,
  Target
} from '@sasjs/utils'
import { findTargetInConfiguration } from '../../../utils'
import { build, getWebServiceScriptInvocation } from '../build'
import { compile } from '../..'
import path from 'path'
import { APP_MANIFEST } from '../internal/appManifest'

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
      appName = `test-app-build-minimal-${generateUniqueTimestamp()}`
      await createTestApp(__dirname, appName)
      const target = (await findTargetInConfiguration('viya')).target

      await compile(target)

      await expect(build(target)).toResolve()
    },
    2 * 60 * 1000
  )

  it(
    `should compile and build(skipping compile)`,
    async () => {
      appName = `test-app-build-${generateUniqueTimestamp()}`

      await createTestApp(__dirname, appName)
      const target = (await findTargetInConfiguration('viya')).target

      await compile(target)
      await expect(build(target)).toResolve()
    },
    2 * 60 * 1000
  )

  it(
    `should package a streamed SASjs target's deployment and its published frontend`,
    async () => {
      appName = `test-app-manifest-${generateUniqueTimestamp()}`
      await createTestApp(__dirname, appName)

      const base = (await findTargetInConfiguration('viya')).target

      // a real compile needs a real frontend: the published app is the compiled
      // app, copied from webSourcePath and adjusted - never a synthesised page
      const webSourcePath = 'websrc'
      await createFolder(path.join(process.projectDir, webSourcePath))
      await createFile(
        path.join(process.projectDir, webSourcePath, 'index.html'),
        '<html><head><sasjs appLoc="/Public/app/default" serverType="SASJS"></sasjs>' +
          '<script src="/assets/app.js"></script></head><body></body></html>'
      )
      await createFile(
        path.join(process.projectDir, webSourcePath, 'assets', 'app.js'),
        'console.log(1)'
      )

      // the same target, deployed as a SASjs app with a streamed web build: the
      // pack this produces is the one the deploy sends, so the bundle is
      // asserted where it is actually written rather than in the helper alone
      const target = {
        ...base,
        name: 'streamed',
        serverType: ServerType.Sasjs,
        appLoc: '/Public/apps/demo',
        streamConfig: {
          streamWeb: true,
          streamWebFolder: 'web',
          webSourcePath,
          streamServiceName: 'demo',
          assetPaths: []
        }
      } as unknown as Target

      await compile(target)
      await build(target)

      const pack = JSON.parse(
        await readFile(
          path.join(
            process.sasjsConstants.buildDestinationFolder,
            'streamed.json'
          )
        )
      )

      const members = pack.fileTree.members as any[]
      const folder = (name: string) =>
        members.find(
          (member) => member.name === name && member.type === 'folder'
        )
      const file = (name: string) =>
        members.find((member) => member.name === name && member.type === 'file')

      // the manifest says which app the frontend is, and where its backend goes
      const manifest = file(APP_MANIFEST)
      expect(manifest).toBeTruthy()
      expect(JSON.parse(manifest.code)).toEqual({
        name: 'demo',
        appLoc: '/Public/apps/demo'
      })

      // the published frontend is the compiled app, as `web/`
      const published = folder('web')
      expect(
        published.members.some(
          (member: any) =>
            member.name === 'index.html' && member.type === 'file'
        )
      ).toBe(true)
      expect(
        published.members.some(
          (member: any) => member.name === 'assets' && member.type === 'folder'
        )
      ).toBe(true)

      // the deployment is the other half: services, the streamed assets and the
      // entry page at the appLoc root
      const backend = folder('backend')
      const backendNames = backend.members.map((member: any) => member.name)
      expect(backendNames).toContain('services')
      expect(backendNames).toContain('web')
      expect(backendNames).toContain('demo.html')

      // nothing states the legacy stream folder: that field is what tells a
      // server the web assets sit inside the deployment, and they do not
      expect(JSON.parse(manifest.code)).not.toHaveProperty('streamWebFolder')

      // the published index resolves its assets inside the app, and talks to
      // the appLoc its backend was deployed to
      const publishedIndex = published.members.find(
        (member: any) => member.name === 'index.html'
      )
      const indexHtml = Buffer.from(publishedIndex.code, 'base64').toString()
      expect(indexHtml).toContain('src="./assets/app.js"')
      expect(indexHtml.toLowerCase()).toContain('apploc="/public/apps/demo"')
    },
    2 * 60 * 1000
  )

  it(
    'keeps a mock site out of the pack, and publishes nothing for it',
    async () => {
      appName = `test-app-mock-${generateUniqueTimestamp()}`
      await createTestApp(__dirname, appName)

      const base = (await findTargetInConfiguration('viya')).target
      const webSourcePath = 'websrc'
      await createFolder(path.join(process.projectDir, webSourcePath))
      await createFile(
        path.join(process.projectDir, webSourcePath, 'index.html'),
        '<html><head><sasjs appLoc="/Public/app/default" serverType="SASJS"></sasjs></head><body></body></html>'
      )

      // both flags, and the mock put *inside* the build folder: an explicit path
      // is allowed, but a site that runs in a browser is not deployment content
      const target = {
        ...base,
        name: 'both',
        serverType: ServerType.Sasjs,
        appLoc: '/Public/apps/demo',
        streamConfig: {
          streamWeb: true,
          streamWebFolder: 'web',
          webSourcePath,
          streamServiceName: 'demo',
          assetPaths: [],
          mockWeb: true,
          mockWebFolder: 'sasjsbuild/mock'
        }
      } as unknown as Target

      await compile(target)
      await build(target)

      const mockFolder = path.join(
        process.sasjsConstants.buildDestinationFolder,
        'mock'
      )
      expect(await folderExists(path.join(mockFolder, 'sasjs.mock.json'))).toBe(
        true
      )

      const names = (tree: any) =>
        (tree.members as any[]).map((member) => member.name)

      const pack = JSON.parse(
        await readFile(
          path.join(process.sasjsConstants.buildDestinationFolder, 'both.json')
        )
      )
      expect(names(pack.fileTree)).not.toContain('mock')

      const backend = (pack.fileTree.members as any[]).find(
        (member) => member.name === 'backend'
      )
      expect(names(backend)).not.toContain('mock')

      // a mock-only build of the same folder must not publish the app either:
      // no manifest, no bundle, no mock
      const mockOnly = {
        ...target,
        name: 'mockonly',
        streamConfig: { ...target.streamConfig, streamWeb: false }
      } as unknown as Target

      await build(mockOnly)

      const mockPack = JSON.parse(
        await readFile(
          path.join(
            process.sasjsConstants.buildDestinationFolder,
            'mockonly.json'
          )
        )
      )
      expect(names(mockPack.fileTree)).not.toContain(APP_MANIFEST)
      expect(names(mockPack.fileTree)).not.toContain('mock')
    },
    2 * 60 * 1000
  )

  it(
    'reports a missing build folder instead of compiling one',
    async () => {
      appName = `test-app-build-${generateUniqueTimestamp()}`

      await createTestApp(__dirname, appName)
      const target = (await findTargetInConfiguration('viya')).target

      const { buildDestinationFolder } = process.sasjsConstants

      if (await folderExists(buildDestinationFolder))
        await deleteFolder(buildDestinationFolder)

      await expect(build(target)).rejects.toThrow(
        /Run 'sasjs compile' \(or 'sasjs cbd'\) first/
      )
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

    appName = `test-app-build-${generateUniqueTimestamp()}`

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
    // The guidance comment only survives removeHeader() because `%global appLoc;`
    // precedes it (regex ^\s*/(\*){1,2}... does not match) - lock that in.
    expect(finalSasFile.includes('Do NOT change compiled_apploc')).toBeTruthy()
  })
})

describe('getWebServiceScriptInvocation', () => {
  describe(ServerType.SasViya, () => {
    it('should return macro invocation for stored program', () => {
      expect(
        getWebServiceScriptInvocation(ServerType.SasViya, true, false)
      ).toEqual(
        '%mv_createwebservice(path=&appLoc&path, name=&service, code=sascode,replace=yes)'
      )
    })

    it('should return macro invocation for stored program', () => {
      expect(
        getWebServiceScriptInvocation(ServerType.SasViya, true, true)
      ).toEqual(
        '%mv_createwebservice(path=&appLoc&path, name=&service, code=sascode,replace=yes)'
      )
    })

    it('should return macro invocation for stored file when encoded is equal to true', () => {
      expect(
        getWebServiceScriptInvocation(ServerType.SasViya, false, true)
      ).toEqual(
        '%mv_createfile(path=&appLoc&path, name=&filename, inref=filecode, intype=BASE64)'
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
        '%mv_createfile(path=&appLoc&path, name=&filename, inref=filecode, intype=BASE64,swap=compiled_apploc apploc)'
      )
    })
  })

  describe(ServerType.Sas9, () => {
    it('should return macro invocation for stored program', () => {
      expect(
        getWebServiceScriptInvocation(ServerType.Sas9, true, false)
      ).toEqual(
        '%mm_createwebservice(path=&appLoc&path, name=&service, code=sascode, server=&serverName, replace=yes)'
      )
    })

    it('should return macro invocation for stored program', () => {
      expect(
        getWebServiceScriptInvocation(ServerType.Sas9, true, true)
      ).toEqual(
        '%mm_createwebservice(path=&appLoc&path, name=&service, code=sascode, server=&serverName, replace=yes)'
      )
    })

    it('should return macro invocation for stored file when encoded is equal to true', () => {
      expect(
        getWebServiceScriptInvocation(ServerType.Sas9, false, true)
      ).toEqual(
        '%mm_createwebservice(path=&appLoc&path, name=&filename, code=filecode, server=&serverName, replace=yes)'
      )
    })
  })

  describe(ServerType.Sasjs, () => {
    it('should return macro invocation for stored program', () => {
      expect(
        getWebServiceScriptInvocation(ServerType.Sasjs, true, false)
      ).toEqual(
        '%mv_createwebservice(path=&appLoc&path, name=&service, code=sascode,replace=yes)'
      )
    })

    it('should return macro invocation for stored program', () => {
      expect(
        getWebServiceScriptInvocation(ServerType.Sasjs, true, true)
      ).toEqual(
        '%mv_createwebservice(path=&appLoc&path, name=&service, code=sascode,replace=yes)'
      )
    })

    it('should return macro invocation for stored file when encoded is equal to true', () => {
      expect(
        getWebServiceScriptInvocation(ServerType.Sasjs, false, true)
      ).toEqual(
        '%mv_createfile(path=&appLoc&path, name=&filename, inref=filecode, intype=BASE64)'
      )
    })
  })
})
