import { Folder } from '../../../types'

export const reactAppFiles: Folder = {
  folderName: '',
  files: [
    { fileName: 'package.json' },
    { fileName: 'package-lock.json' },
    { fileName: 'tsconfig.json' },
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
        { fileName: 'App.scss' },
        { fileName: 'cached_data.ts' },
        { fileName: 'index.scss' },
        { fileName: 'index.tsx' },
        { fileName: 'logo.svg' },
        { fileName: 'react-app-env.d.ts' },
        { fileName: 'serviceWorker.ts' }
      ],
      subFolders: [
        {
          folderName: 'components',
          files: [
            { fileName: 'data-page.component.tsx' },
            { fileName: 'home-page.component.tsx' },
            { fileName: 'login.component.tsx' },
            { fileName: 'request-modal.component.jsx' },
            { fileName: 'syntax-highlighting.css' },
            { fileName: 'user-name.component.tsx' }
          ],
          subFolders: []
        },
        {
          folderName: 'context',
          files: [{ fileName: 'sasContext.tsx' }],
          subFolders: []
        },
        {
          folderName: 'layouts',
          files: [{ fileName: 'Main.jsx' }],
          subFolders: []
        },
        {
          folderName: 'routes',
          files: [{ fileName: 'index.js' }],
          subFolders: []
        },
        {
          folderName: 'theme',
          files: [{ fileName: 'index.js' }],
          subFolders: []
        }
      ]
    },
    {
      folderName: 'node_modules',
      files: [],
      subFolders: [
        {
          folderName: '@sasjs',
          subFolders: [],
          files: []
        },
        {
          folderName: 'react',
          subFolders: [],
          files: []
        }
      ]
    }
  ]
}
