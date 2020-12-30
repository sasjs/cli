import { Folder } from '../../types'

export const compiledFiles: Folder = {
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
            { fileName: 'getdata.sas' }
          ],
          subFolders: []
        }
      ]
    }
  ]
}
