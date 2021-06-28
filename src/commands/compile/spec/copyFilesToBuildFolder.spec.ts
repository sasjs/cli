import { Folder } from '../../../types'
import { findTargetInConfiguration } from '../../../utils/config'
import { createTestApp, removeTestApp, verifyFolder } from '../../../utils/test'
import { asyncForEach, generateTimestamp } from '@sasjs/utils'
import * as getAllServiceFoldersModule from '../internal/getAllServiceFolders'
import * as compileModule from '../compile'

describe('copyFilesToBuildFolder', () => {
  let appName: string

  beforeEach(async () => {
    appName = `cli-tests-copyFilesToBuildFolder-${generateTimestamp()}`
    await createTestApp(__dirname, appName)
  })

  afterEach(async () => {
    await removeTestApp(__dirname, appName)
  })

  it('should copy files into the sasjsbuild folder', async () => {
    const { target } = await findTargetInConfiguration('viya')
    await expect(compileModule.copyFilesToBuildFolder(target)).toResolve()
    await verifyBuildFolder()
  })

  it('should throw an error when one occurs during copying', async () => {
    jest
      .spyOn(getAllServiceFoldersModule, 'getAllServiceFolders')
      .mockImplementation(() => {
        throw new Error('Test Error')
      })
    const { target } = await findTargetInConfiguration('viya')

    await expect(
      compileModule.copyFilesToBuildFolder(target)
    ).rejects.toThrowError('Test Error')
  })
})

const verifyBuildFolder = async () => {
  const folders: Folder[] = [
    {
      folderName: 'sasjsbuild',
      files: [],
      subFolders: [
        {
          folderName: 'services',
          files: [],
          subFolders: [
            {
              folderName: 'admin',
              files: [{ fileName: 'dostuff.sas' }],
              subFolders: []
            },
            {
              folderName: 'common',
              files: [
                { fileName: 'appinit.sas' },
                { fileName: 'getdata.sas' },
                { fileName: 'example.sas' }
              ],
              subFolders: []
            }
          ]
        }
      ]
    }
  ]

  await asyncForEach(folders, async (folder: Folder) => {
    await verifyFolder(folder)
  })
}
