import { Folder } from '../../types'

export const compiledFilesCustom1: Folder = {
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
            { fileName: 'example.sas' },
            { fileName: 'get.sasdata.sas' }
          ],
          subFolders: []
        }
      ]
    }
  ]
}
