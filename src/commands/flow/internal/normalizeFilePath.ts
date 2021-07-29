import { getRealPath } from '@sasjs/utils'
import path from 'path'

export const normalizeFilePath = (filePath: string) => {
  const pathSepRegExp = new RegExp(path.sep.replace(/\\/g, '\\\\'), 'g')

  return getRealPath(filePath).replace(pathSepRegExp, '/')
}
