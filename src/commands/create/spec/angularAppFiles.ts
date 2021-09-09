import { Folder } from '../../../types'

export const angularAppFiles: Folder = {
  folderName: '',
  files: [
    { fileName: 'package.json' },
    { fileName: 'package-lock.json' },
    { fileName: 'tsconfig.json' },
    { fileName: 'tslint.json' },
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
        { fileName: 'styles.scss' },
        { fileName: 'test.ts' }
      ],
      subFolders: [
        {
          folderName: 'app',
          files: [
            { fileName: 'app.component.html' },
            { fileName: 'app.component.scss' },
            { fileName: 'app.component.spec.ts' },
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
              folderName: 'components',
              files: [],
              subFolders: [
                {
                  folderName: 'login-modal',
                  files: [
                    { fileName: 'login-modal.component.html' },
                    { fileName: 'login-modal.component.scss' },
                    { fileName: 'login-modal.component.spec.ts' },
                    { fileName: 'login-modal.component.ts' }
                  ],
                  subFolders: []
                },
                {
                  folderName: 'requests-modal',
                  files: [
                    { fileName: 'requests-modal.component.html' },
                    { fileName: 'requests-modal.component.scss' },
                    { fileName: 'requests-modal.component.spec.ts' },
                    { fileName: 'requests-modal.component.ts' }
                  ],
                  subFolders: []
                }
              ]
            },
            {
              folderName: 'data',
              files: [
                { fileName: 'data.component.html' },
                { fileName: 'data.component.scss' },
                { fileName: 'data.component.spec.ts' },
                { fileName: 'data.component.ts' }
              ],
              subFolders: []
            },
            {
              folderName: 'home-page',
              files: [
                { fileName: 'home-page.component.html' },
                { fileName: 'home-page.component.scss' },
                { fileName: 'home-page.component.spec.ts' },
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
    }
  ]
}
