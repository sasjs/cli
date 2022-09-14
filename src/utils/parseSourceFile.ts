import { fileExists, isMacroVars, MacroVars, readFile } from '@sasjs/utils'
import path from 'path'
import { isJsonFile } from './file'

export async function parseSourceFile(source: string): Promise<MacroVars> {
  let macroVars

  const currentDirPath = path.isAbsolute(source) ? '' : process.projectDir
  source = path.join(currentDirPath, source)

  if (!isJsonFile(source)) throw 'Source file has to be JSON.'

  await fileExists(source).catch((_) => {
    throw 'Error while checking if source file exists.'
  })

  source = await readFile(source).catch((_) => {
    throw 'Error while reading source file.'
  })

  macroVars = JSON.parse(source as string) as MacroVars

  if (!isMacroVars(macroVars)) {
    throw `Provided source is not valid. An example of valid source:
{ macroVars: { name1: 'value1', name2: 'value2' } }`
  }

  return macroVars
}
