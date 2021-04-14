import { Folder } from '../../types'

export const builtFiles = (buildFileName: string): Folder => {
  return {
    folderName: 'sasjsbuild',
    files: [
      { fileName: `${buildFileName}.sas` },
      { fileName: `${buildFileName}.json` }
    ],
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
}
