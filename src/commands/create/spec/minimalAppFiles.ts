import { Folder } from '../../../types'

export const minimalAppFiles: Folder = {
  folderName: '',
  files: [
    { fileName: 'package.json' },
    { fileName: 'package-lock.json' },
    { fileName: 'README.md' }
  ],
  subFolders: [
    {
      folderName: 'sasjs',
      files: [{ fileName: 'sasjsconfig.json' }],
      subFolders: [
        {
          folderName: 'macros',
          files: [],
          subFolders: []
        },
        {
          folderName: 'services',
          files: [],
          subFolders: [
            {
              folderName: 'common',
              files: [{ fileName: 'appinit.sas' }, { fileName: 'getdata.sas' }],
              subFolders: []
            }
          ]
        }
      ]
    },
    {
      folderName: 'src',
      files: [
        { fileName: 'index.html' },
        { fileName: 'scripts.js' },
        { fileName: 'style.css' }
      ],
      subFolders: []
    },
    {
      folderName: 'node_modules',
      files: [],
      subFolders: [
        {
          folderName: '@sasjs',
          files: [],
          subFolders: []
        }
      ]
    }
  ]
}
