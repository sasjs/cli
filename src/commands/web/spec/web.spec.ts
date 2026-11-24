import path from 'path'
import {
  generateUniqueTimestamp,
  createTestMinimalApp,
  removeTestApp,
  updateConfig,
  updateTarget,
  verifyFolder
} from '../../../utils/test'
import { Folder } from '../../../types'
import {
  createFile,
  createFolder,
  readFile,
  ServerType,
  StreamConfig
} from '@sasjs/utils'
import { createWebAppServices } from '../web'
import { findTargetInConfiguration, getLocalConfig } from '../../../utils'

const webBuiltFilesSASVIYA = (indexHtml: string = 'clickme'): Folder => ({
  folderName: 'sasjsbuild',
  files: [{ fileName: `${indexHtml}.html` }],
  subFolders: [
    {
      folderName: 'webv',
      files: [
        { fileName: 'favicon.ico' },
        { fileName: 'sasjs.js' },
        { fileName: 'scripts.js' },
        { fileName: 'style.css' },
        { fileName: 'testing.js.map' }
      ],
      subFolders: []
    }
  ]
})

const webBuiltFilesSAS9 = (indexHtml: string = 'clickme'): Folder => ({
  folderName: 'sasjsbuild',
  files: [{ fileName: `${indexHtml}.sas` }],
  subFolders: [
    {
      folderName: 'webv',
      files: [
        { fileName: 'favicon-ico.sas' },
        { fileName: 'sasjs-js.sas' },
        { fileName: 'scripts-js.sas' },
        { fileName: 'style-css.sas' },
        { fileName: 'testing.js-map.sas' }
      ],
      subFolders: []
    }
  ]
})

const streamConfig: StreamConfig = {
  assetPaths: [],
  streamWeb: true,
  streamWebFolder: 'webv',
  webSourcePath: 'src',
  streamServiceName: 'clickme'
}

describe('sasjs web', () => {
  let appName: string

  beforeAll(async () => {
    appName = `cli-test-web-minimal-${generateUniqueTimestamp()}`
    await createTestMinimalApp(__dirname, appName)

    await updateConfig({
      streamConfig: {
        ...streamConfig,
        streamServiceName: undefined
      } as any as StreamConfig
    })

    await createFile(
      path.join(
        __dirname,
        appName,
        streamConfig.webSourcePath,
        'testing.js.map'
      ),
      ''
    )

    await updateTarget({ streamConfig: undefined }, 'viya')
    await updateTarget(
      { serverUrl: undefined, streamConfig: undefined },
      'sas9'
    )

    process.sasjsConfig = await getLocalConfig()
  })

  afterAll(async () => {
    await removeTestApp(__dirname, appName)
  })

  it(
    `should create web app with minimal template for target SASVIYA`,
    async () => {
      const viyaTarget = (await findTargetInConfiguration('viya')).target
      await expect(createWebAppServices(viyaTarget)).toResolve()

      await expect(verifyFolder(webBuiltFilesSASVIYA())).resolves.toEqual(true)
    },
    2 * 60 * 1000
  )

  it(
    `should create web app with minimal template for target SAS9`,
    async () => {
      const sas9Target = (await findTargetInConfiguration('sas9')).target
      await expect(createWebAppServices(sas9Target)).toResolve()

      await expect(verifyFolder(webBuiltFilesSAS9())).resolves.toEqual(true)
    },
    2 * 60 * 1000
  )

  it(
    `should create web app with minimal template for target SASVIYA with custom streamServiceName`,
    async () => {
      const streamServiceName = 'clickme_VIYA'
      await updateTarget(
        {
          streamConfig: { ...streamConfig, streamServiceName }
        },
        'viya'
      )
      const targetCustomServiceName = (await findTargetInConfiguration('viya'))
        .target
      await expect(createWebAppServices(targetCustomServiceName)).toResolve()

      await expect(
        verifyFolder(webBuiltFilesSASVIYA(streamServiceName))
      ).resolves.toEqual(true)
    },
    2 * 60 * 1000
  )

  it(
    `should create web app with minimal template for target SAS9 with custom streamServiceName`,
    async () => {
      const streamServiceName = 'clickme_SAS9'
      await updateTarget(
        {
          streamConfig: { ...streamConfig, streamServiceName }
        },
        'sas9'
      )
      const targetCustomServiceName = (await findTargetInConfiguration('sas9'))
        .target
      await expect(createWebAppServices(targetCustomServiceName)).toResolve()

      await expect(
        verifyFolder(webBuiltFilesSAS9(streamServiceName))
      ).resolves.toEqual(true)
    },
    2 * 60 * 1000
  )

  it(
    `should stream the web app for a SASjs target the way Viya streams it`,
    async () => {
      // A SASjs server build is the same artefact a Viya build is: assets are
      // copied into the deployment folder and the entry page's links point at
      // the server's file route, so a build made for either host opens on the
      // other at the address its own route answers.
      const sourceFolder = 'websrc'
      await createFolder(path.join(__dirname, appName, sourceFolder))
      await createFile(
        path.join(__dirname, appName, sourceFolder, 'index.html'),
        '<html><head><sasjs appLoc="/Public/app/default" serverType="SASJS"></sasjs>' +
          '<script src="runtime.js" type="module"></script>' +
          '<script src="app.js"></script>' +
          '<link rel="stylesheet" href="app.css"></head><body></body></html>'
      )
      // a split bundle: the runtime composes each chunk's name at run time and
      // joins it to an empty public path, so no chunk file name exists in the
      // text the build rewrites
      await createFile(
        path.join(__dirname, appName, sourceFolder, 'runtime.js'),
        'var t={};t.u=e=>e+"."+{15:"ba407bec"}[e]+".js";t.p="";'
      )
      await createFile(
        path.join(__dirname, appName, sourceFolder, '15.ba407bec.js'),
        'console.log("lazy chunk")'
      )
      await createFile(
        path.join(__dirname, appName, sourceFolder, 'app.js'),
        'console.log(1)'
      )
      await createFile(
        path.join(__dirname, appName, sourceFolder, 'app.css'),
        'body{}'
      )

      const sasjsTarget: any = {
        name: 'sasjs-stream',
        serverType: ServerType.Sasjs,
        appLoc: '/Public/app/AnotherLoc',
        streamConfig: {
          ...streamConfig,
          webSourcePath: sourceFolder,
          streamWebFolder: 'websas'
        }
      }

      await expect(createWebAppServices(sasjsTarget)).toResolve()

      // the entry page sits at the appLoc root and its assets beside it, not
      // inside the services folder
      const buildFolder = process.sasjsConstants.buildDestinationFolder
      const entry = (
        await readFile(path.join(buildFolder, 'clickme.html'))
      ).toLowerCase()

      // the entry page carries the target's appLoc, not the frontend's own
      expect(entry).toContain('apploc="/public/app/anotherloc"')
      expect(entry).not.toContain('/public/app/default')

      // and every asset is fetched through the server's own file route, with
      // the appLoc it was deployed to baked in - as it is for Viya
      expect(entry).toContain(
        'src="/storedprogram?_file=/public/app/anotherloc/websas/app.js"'
      )
      expect(entry).toContain(
        'href="/storedprogram?_file=/public/app/anotherloc/websas/app.css"'
      )

      // the asset itself is a file in the deployment, not a service
      await expect(
        readFile(path.join(buildFolder, 'websas', 'app.js'))
      ).resolves.toEqual('console.log(1)')

      // The chunk is not named in index.html, but must still be deployed.
      await expect(
        readFile(path.join(buildFolder, 'websas', '15.ba407bec.js'))
      ).resolves.toEqual('console.log("lazy chunk")')

      // a lazily loaded chunk is named by the runtime, not by the entry page, so
      // the runtime's public path is what sends it to the deployment folder
      const runtime = await readFile(
        path.join(buildFolder, 'websas', 'runtime.js')
      )
      expect(runtime).toContain(
        't.p="/StoredProgram?_FILE=/Public/app/AnotherLoc/websas/"'
      )

      // the copy of the entry page in the asset folder is served as a web app in
      // its own right - an app stream on this server - and it has to talk to the
      // appLoc the deployment was made to, not the one the frontend was built for
      const folderEntry = (
        await readFile(path.join(buildFolder, 'websas', 'index.html'))
      ).toLowerCase()
      expect(folderEntry).toContain('apploc="/public/app/anotherloc"')
      expect(folderEntry).not.toContain('/public/app/default')
    },
    2 * 60 * 1000
  )
})
