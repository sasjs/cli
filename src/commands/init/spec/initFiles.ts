import { Folder } from '../../../types'

export const initFiles: Folder = {
  folderName: '',
  files: [
    { fileName: 'package.json' },
    { fileName: 'package-lock.json' },
    { fileName: '.gitignore' }
  ],
  subFolders: [
    {
      folderName: 'sasjs',
      files: [{ fileName: 'sasjsconfig.json' }],
      subFolders: [
        {
          folderName: 'doxy',
          files: [
            { fileName: 'Doxyfile' },
            { fileName: 'DoxygenLayout.xml' },
            { fileName: 'favicon.ico' },
            { fileName: 'new_footer.html' },
            { fileName: 'new_header.html' },
            { fileName: 'new_stylesheet.css' },
            { fileName: 'logo.png' }
          ],
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
          files: [],
          subFolders: []
        }
      ]
    }
  ]
}
