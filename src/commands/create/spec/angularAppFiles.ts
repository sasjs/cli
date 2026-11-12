import { Folder } from '../../../types'

export const angularAppFiles: Folder = {
  folderName: '',
  files: [
    { fileName: 'package.json' },
    { fileName: 'package-lock.json' },
    { fileName: 'tsconfig.json' },
    { fileName: 'angular.json' },
    { fileName: 'tsconfig.app.json' },
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
              subFolders: [],
              files: [{ fileName: 'appinit.sas' }, { fileName: 'getdata.sas' }]
            }
          ]
        }
      ]
    },
    {
      folderName: 'src',
      files: [
        { fileName: 'favicon.ico' },
        { fileName: 'index.html' },
        { fileName: 'main.ts' },
        { fileName: 'polyfills.ts' },
        { fileName: 'styles.scss' }
      ],
      subFolders: [
        {
          folderName: 'app',
          files: [
            { fileName: 'app.component.html' },
            { fileName: 'app.component.scss' },
            { fileName: 'app.component.ts' },
            { fileName: 'app.module.ts' },
            { fileName: 'app-routing.module.ts' },
            { fileName: 'sas.service.spec.ts' },
            { fileName: 'sas.service.ts' },
            { fileName: 'state.service.spec.ts' },
            { fileName: 'state.service.ts' }
          ],
          subFolders: [
            {
              folderName: 'sasjs-ui',
              files: [
                { fileName: 'sasjs-ui.component.html' },
                { fileName: 'sasjs-ui.component.scss' },
                { fileName: 'sasjs-ui.component.ts' }
              ],
              subFolders: []
            },
            {
              folderName: 'data',
              files: [
                { fileName: 'data.component.html' },
                { fileName: 'data.component.scss' },
                { fileName: 'data.component.ts' }
              ],
              subFolders: []
            },
            {
              folderName: 'home-page',
              files: [
                { fileName: 'home-page.component.html' },
                { fileName: 'home-page.component.scss' },
                { fileName: 'home-page.component.ts' }
              ],
              subFolders: []
            }
          ]
        },
        {
          folderName: 'assets',
          files: [
            { fileName: 'angular-logo.png' },
            { fileName: 'logo-white.png' }
          ],
          subFolders: []
        },
        {
          folderName: 'environments',
          files: [
            { fileName: 'environment.prod.ts' },
            { fileName: 'environment.ts' }
          ],
          subFolders: []
        }
      ]
    },
    {
      // The docs folder is a submodule, and its pages are the submodule's own
      // (a docsify site today, an index.html before that). The folder is what
      // this asserts; naming a page here breaks on the submodule's next change.
      folderName: 'docs',
      files: [],
      subFolders: []
    }
  ]
}
