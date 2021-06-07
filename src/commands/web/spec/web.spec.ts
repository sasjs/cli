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
import { StreamConfig, generateTimestamp } from '@sasjs/utils'

export const webBuiltFiles: Folder = {
  folderName: 'sasjsbuild',
  files: [],
  subFolders: [
    {
      folderName: 'services',
      files: [{ fileName: 'clickme.sas' }],
      subFolders: [
        {
          folderName: 'webv',
          files: [{ fileName: 'scriptsjs.sas' }, { fileName: 'stylecss.sas' }],
          subFolders: []
        }
      ]
    }
  ]
}

describe('sasjs web', () => {
  let appName: string

  afterEach(async () => {
    await removeTestApp(__dirname, appName)
  })

  it(
    `should create web app with minimal template`,
    async () => {
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

      await expect(buildWebApp(new Command(`web -t viya`))).resolves.toEqual(0)

      await expect(verifyFolder(webBuiltFiles)).resolves.toEqual(true)
    },
    2 * 60 * 1000
  )
})
