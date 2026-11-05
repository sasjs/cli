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
import { createFile, readFile, ServerType, StreamConfig } from '@sasjs/utils'
import { createWebAppServices } from '../web'
import { findTargetInConfiguration, getLocalConfig } from '../../../utils'

const webBuiltFilesSASVIYA = (indexHtml: string = 'clickme'): Folder => ({
  folderName: 'sasjsbuild',
  files: [],
  subFolders: [
    {
      folderName: 'services',
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
    }
  ]
})

const webBuiltFilesSAS9 = (indexHtml: string = 'clickme'): Folder => ({
  folderName: 'sasjsbuild',
  files: [],
  subFolders: [
    {
      folderName: 'services',
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
    `should stamp the target's appLoc into the copied app for a SASjs target`,
    async () => {
      // The app reads its appLoc from the <sasjs> tag, and an AppStream app
      // gets no appLoc from its URL - so a copy that kept the frontend's own
      // value would call services on the default appLoc whatever was deployed.
      const sourceFolder = 'websrc'
      await createFile(
        path.join(__dirname, appName, sourceFolder, 'index.html'),
        '<html><head><sasjs appLoc="/Public/app/default" serverType="SASJS"></sasjs></head><body></body></html>'
      )

      const sasjsTarget: any = {
        name: 'sasjs-loc',
        serverType: ServerType.Sasjs,
        appLoc: '/Public/app/AnotherLoc',
        streamConfig: {
          ...streamConfig,
          webSourcePath: sourceFolder,
          streamWebFolder: 'websas'
        }
      }

      await expect(createWebAppServices(sasjsTarget)).toResolve()

      const copied = await readFile(
        path.join(
          process.sasjsConstants.buildDestinationServicesFolder,
          'websas',
          'index.html'
        )
      )

      // jsdom serialises attribute names in lower case
      expect(copied.toLowerCase()).toContain('apploc="/public/app/anotherloc"')
      expect(copied.toLowerCase()).not.toContain('/public/app/default')
    },
    2 * 60 * 1000
  )
})
