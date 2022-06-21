import { Folder } from '../../types'

export const builtFilesCustom1 = (buildFileName: string): Folder => {
  return {
    folderName: 'sasjsbuild',
    files: [
      { fileName: `${buildFileName}.sas` },
      { fileName: `${buildFileName}.json` },
      { fileName: `${buildFileName}.json.zip` }
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
              { fileName: 'get.sasdata.sas' }
            ],
            subFolders: []
          }
        ]
      }
    ]
  }
}
