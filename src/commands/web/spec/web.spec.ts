import path from 'path'
import { Command } from '../../../utils/command'
import {
  createTestMinimalApp,
  removeTestApp,
  updateConfig,
  updateTarget,
  verifyFolder
} from '../../../utils/test'
import { Folder } from '../../../types'
import {
  createFile,
  generateTimestamp,
  StreamConfig,
  Target
} from '@sasjs/utils'
import { createWebAppServices } from '../web'
import { findTargetInConfiguration } from '../../../utils'

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
    appName = `cli-test-web-minimal-${generateTimestamp()}`
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
})
