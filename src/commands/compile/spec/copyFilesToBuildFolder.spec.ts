import { Folder } from '../../../types'
import { findTargetInConfiguration } from '../../../utils/config'
import { createTestApp, removeTestApp, verifyFolder } from '../../../utils/test'
import { generateTimestamp, asyncForEach } from '../../../utils/utils'
import * as getAllServiceFoldersModule from '../internal/getAllServiceFolders'
import * as compileModule from '../compile'

describe('copyFilesToBuildFolder', () => {
  let appName: string

  beforeEach(async (done) => {
    appName = `cli-tests-copyFilesToBuildFolder-${generateTimestamp()}`
    await createTestApp(__dirname, appName)
    done()
  })

  afterEach(async (done) => {
    await removeTestApp(__dirname, appName)
    jest.clearAllMocks()
    done()
  })

  it('should copy files into the sasjsbuild folder', async (done) => {
    const { target } = await findTargetInConfiguration('viya')
    await expect(compileModule.copyFilesToBuildFolder(target)).toResolve()
    await verifyBuildFolder()
    done()
  })

  it('should throw an error when one occurs during copying', async (done) => {
    jest
      .spyOn(getAllServiceFoldersModule, 'getAllServiceFolders')
      .mockImplementation(() => {
        throw new Error('Test Error')
      })
    const { target } = await findTargetInConfiguration('viya')

    await expect(
      compileModule.copyFilesToBuildFolder(target)
    ).rejects.toThrowError('Test Error')
    done()
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
        },
        {
          folderName: 'targets',
          files: [],
          subFolders: [
            {
              folderName: 'viya',
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
                    }
                  ]
                }
              ]
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
