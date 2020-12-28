import { File } from './file'
export interface Folder {
  folderName: string
  subFolders: Folder[]
  files: File[]
}
