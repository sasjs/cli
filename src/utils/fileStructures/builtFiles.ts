import { Folder } from '../../types'

export const builtFiles: Folder = {
  folderName: 'sasjsbuild',
  files: [{ fileName: 'viya.sas' }, { fileName: 'viya.json' }],
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
