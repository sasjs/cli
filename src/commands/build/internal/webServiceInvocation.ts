import { ServerType } from '@sasjs/utils'
import { ServerTypeError } from '@sasjs/utils/error'

export function getWebServiceScriptInvocation(
  serverType: ServerType,
  isSASFile: boolean = true,
  encoded: boolean = false,
  fileName?: string
) {
  const encodedParam = encoded ? ', intype=BASE64' : ''

  switch (serverType) {
    case ServerType.SasViya:
      let swapString = ''

      if (fileName) {
        const extension = fileName?.split('.').pop()?.toLowerCase() || ''

        if (['html', 'css', 'js'].includes(extension)) {
          swapString = `,swap=compiled_apploc apploc`
        }
      }

      return isSASFile
        ? `%mv_createwebservice(path=&appLoc&path, name=&service, code=sascode,replace=yes)`
        : `%mv_createfile(path=&appLoc&path, name=&filename, inref=filecode${encodedParam}${swapString})`
    case ServerType.Sas9:
      return isSASFile
        ? `%mm_createwebservice(path=&appLoc&path, name=&service, code=sascode, server=&serverName, replace=yes)`
        : `%mm_createwebservice(path=&appLoc&path, name=&filename, code=filecode, server=&serverName, replace=yes)`
    case ServerType.Sasjs:
      return isSASFile
        ? `%mv_createwebservice(path=&appLoc&path, name=&service, code=sascode,replace=yes)`
        : `%mv_createfile(path=&appLoc&path, name=&filename, inref=filecode${encodedParam})`
    default:
      throw new ServerTypeError()
  }
}
