import path from 'path'
import { buildWebApp } from '../../../main'
import { Command } from '../../../utils/command'
import {
  resetTestAppAndReuse,
  updateConfig,
  updateTarget,
  verifyFolder,
  APP_NAMES
} from '../../../utils/test'
import { Folder } from '../../../types'
import { createFile, StreamConfig } from '@sasjs/utils'

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
  beforeAll(async () => {
    const appName = APP_NAMES.MINIMAL_SEED_APP
    await resetTestAppAndReuse(APP_NAMES.MINIMAL_SEED_APP)

    await updateConfig({
      streamConfig: {
        ...streamConfig,
        streamServiceName: undefined
      } as any as StreamConfig
    })

    await createFile(
      path.join(
        process.cwd(),
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

  it(
    `should create web app with minimal template for target SASVIYA`,
    async () => {
      await expect(buildWebApp(new Command(`web -t viya`))).resolves.toEqual(0)

      await expect(verifyFolder(webBuiltFilesSASVIYA())).resolves.toEqual(true)
    },
    2 * 60 * 1000
  )

  it(
    `should create web app with minimal template for target SAS9`,
    async () => {
      await expect(buildWebApp(new Command(`web -t sas9`))).resolves.toEqual(0)

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
      await expect(buildWebApp(new Command(`web -t viya`))).resolves.toEqual(0)

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
      await expect(buildWebApp(new Command(`web -t sas9`))).resolves.toEqual(0)

      await expect(
        verifyFolder(webBuiltFilesSAS9(streamServiceName))
      ).resolves.toEqual(true)
    },
    2 * 60 * 1000
  )
})
