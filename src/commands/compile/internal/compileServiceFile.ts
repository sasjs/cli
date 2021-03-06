import path from 'path'
import { Target, ServerType } from '@sasjs/utils/types'

import { getMacroCorePath } from '../../../utils/config'
import { createFile, readFile } from '../../../utils/file'
import { loadDependencies } from './loadDependencies'
import { getServerType } from './getServerType'

export async function compileServiceFile(
  target: Target,
  filePath: string,
  macroFolders: string[],
  programFolders: string[]
) {
  let dependencies = await loadDependencies(
    target,
    filePath,
    macroFolders,
    programFolders
  )

  const serverType = await getServerType(target)
  const preCode = await getPreCodeForServicePack(serverType)

  dependencies = `${preCode}\n${dependencies}`

  await createFile(filePath, dependencies)
}

async function getPreCodeForServicePack(serverType: ServerType) {
  let content = ''
  const macroCorePath = getMacroCorePath()
  switch (serverType) {
    case ServerType.SasViya:
      content += await readFile(`${macroCorePath}/base/mf_getuser.sas`)
      content += await readFile(`${macroCorePath}/base/mp_jsonout.sas`)
      content += await readFile(`${macroCorePath}/viya/mv_webout.sas`)
      content +=
        '/* if calling viya service with _job param, _program will conflict */\n' +
        '/* so we provide instead as __program */\n' +
        '%global __program _program;\n' +
        '%let _program=%sysfunc(coalescec(&__program,&_program));\n' +
        '%macro webout(action,ds,dslabel=,fmt=);\n' +
        '%mv_webout(&action,ds=&ds,dslabel=&dslabel,fmt=&fmt)\n' +
        '%mend;\n'
      break

    case ServerType.Sas9:
      content += await readFile(`${macroCorePath}/base/mf_getuser.sas`)
      content += await readFile(`${macroCorePath}/base/mp_jsonout.sas`)
      content += await readFile(`${macroCorePath}/meta/mm_webout.sas`)
      content +=
        '  %macro webout(action,ds,dslabel=,fmt=);\n' +
        '    %mm_webout(&action,ds=&ds,dslabel=&dslabel,fmt=&fmt)\n' +
        '  %mend;\n'
      break

    default:
      throw new Error(
        `Invalid server type: valid options are 'SASVIYA' and 'SAS9'.`
      )
  }
  content +=
    '/* provide additional debug info */\n' +
    '%put user=%mf_getuser();\n' +
    '%put pgm=&_program;\n' +
    '%put timestamp=%sysfunc(datetime(),datetime19.);\n'
  return content
}
