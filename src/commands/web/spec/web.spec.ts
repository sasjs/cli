import { buildWebApp } from '../../../main'
import { Command } from '../../../utils/command'
import {
  createTestMinimalApp,
  removeTestApp,
  updateConfig,
  updateTarget,
  verifyFolder
} from '../../../utils/test'
import { Folder } from '../../../types'
import { generateTimestamp } from '@sasjs/utils'

export const webBuiltFilesSASVIYA: Folder = {
  folderName: 'sasjsbuild',
  files: [],
  subFolders: [
    {
      folderName: 'services',
      files: [{ fileName: 'clickme.html' }],
      subFolders: [
        {
          folderName: 'webv',
          files: [{ fileName: 'scripts.js' }, { fileName: 'style.css' }],
          subFolders: []
        }
      ]
    }
  ]
}

export const webBuiltFilesSAS9: Folder = {
  folderName: 'sasjsbuild',
  files: [],
  subFolders: [
    {
      folderName: 'services',
      files: [{ fileName: 'clickme.sas' }],
      subFolders: [
        {
          folderName: 'webv',
          files: [
            { fileName: 'favicon-ico.sas' },
            { fileName: 'sasjs-js.sas' },
            { fileName: 'scripts-js.sas' },
            { fileName: 'style-css.sas' }
          ],
          subFolders: []
        }
      ]
    }
  ]
}

describe('sasjs web', () => {
  let appName: string

  beforeAll(async () => {
    appName = `cli-test-web-minimal-${generateTimestamp()}`
    await createTestMinimalApp(__dirname, appName)

    await updateConfig({
      streamConfig: {
        assetPaths: [],
        streamWeb: true,
        streamWebFolder: 'webv',
        webSourcePath: 'src',
        streamServiceName: 'clickme'
      }
    })

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
      await expect(buildWebApp(new Command(`web -t viya`))).resolves.toEqual(0)

      await expect(verifyFolder(webBuiltFilesSASVIYA)).resolves.toEqual(true)
    },
    2 * 60 * 1000
  )

  it(
    `should create web app with minimal template for target SAS9`,
    async () => {
      await expect(buildWebApp(new Command(`web -t sas9`))).resolves.toEqual(0)

      await expect(verifyFolder(webBuiltFilesSAS9)).resolves.toEqual(true)
    },
    2 * 60 * 1000
  )
})
