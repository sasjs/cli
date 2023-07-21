import {
  Configuration,
  Target,
  listSasFilesInFolder,
  asyncForEach,
  readFile,
  createFile,
  isTestFile,
  getLineEnding
} from '@sasjs/utils'
import path from 'path'

interface Snippet {
  prefix: string
  body: string
  description: string[]
}

const sasRegExp = /\.sas$/ // to check if file has .sas extension
const briefRegExp = /^\s\s@brief\s/ // to get lines that has @brief keyword
const paramRegExp = /^\s\s@param\s/ // to get lines that has @param keyword

/**
 * Generates VS Code snippets.
 * @param config an object representing SASjs configuration.
 * @param targetName SASjs target name.
 * @param outDirectory a folder path where generated snippets should be put into. If ends with '<file name>.json' then provided file name will be used, otherwise default file name ('sasjs-macro-snippets.json') will be used.
 * @returns a promise that resolves into a file path with generated VS Code snippets.
 */
export async function generateSnippets(
  config?: Configuration,
  targetName?: string,
  outDirectory?: string
) {
  let macroFolders: string[] = []

  const configMacroFolders = config?.macroFolders

  // add macro folders from configuration if present
  if (configMacroFolders) macroFolders = configMacroFolders

  // add macro folders from target if present
  if (config && targetName && config.targets?.length) {
    const target = config.targets.filter(
      (target) => target.name === targetName
    )[0]

    if (target && target.macroFolders) {
      macroFolders = [...macroFolders, ...target.macroFolders]
    }
  }

  // an object that represents generated snippets
  const snippets: { [key: string]: Snippet } = {}

  // return an error if no macro folders has been provided
  if (!macroFolders.length) {
    return Promise.reject(
      `"macroFolders" array was not found in sasjs/sasjsconfig.json.`
    )
  }

  // get whole file path to macro folders
  macroFolders = macroFolders.map((folder) =>
    path.join(process.projectDir, folder)
  )

  // generate snippets from all .sas file in macro folders
  await asyncForEach(macroFolders, async (folder) => {
    // get .sas files excluding test('*.test.sas') files
    const sasFiles = (await listSasFilesInFolder(folder, true))
      .map((file) => path.join(folder, file))
      .filter((file) => !isTestFile(file))

    await asyncForEach(sasFiles, async (file) => {
      // get macro name
      const macro: string = file.split(path.sep).pop().replace(sasRegExp, '')

      // put generated snippet into snippets object
      snippets[macro] = await createMacro(file)
    })
  })

  // return an error if no snippets has been generated
  if (!Object.keys(snippets).length) {
    return Promise.reject('No VS Code snippets has been found.')
  }

  const defaultOutputFileName = 'sasjs-macro-snippets.json'

  const { buildDestinationResultsFolder } = process.sasjsConstants

  // if outDirectory is provided, use it depending if it has file name or a folder only. If outDirectory is not provided, default file name and build result folder should be used.
  const snippetsFilePath = path.join(
    outDirectory ? process.projectDir : buildDestinationResultsFolder,
    outDirectory
      ? /\.json$/.test(outDirectory)
        ? outDirectory
        : path.join(outDirectory, defaultOutputFileName)
      : defaultOutputFileName
  )

  // create file with generated VS Code snippets
  await createFile(snippetsFilePath, JSON.stringify(snippets, null, 2))

  // return file path with generated VS Code snippets
  return Promise.resolve(snippetsFilePath)
}

/**
 * Creates a VS Code snippet from SAS macro.
 * @param file file path of SAS macro.
 * @returns promise that resolves with VS Code snippet.
 */
const createMacro = async (file: string): Promise<Snippet> => {
  const fileContent = await readFile(file)
  const lineEnding = getLineEnding(fileContent) // LF or CRLF
  const lines = fileContent.split(lineEnding)

  let brief = lines.filter((line) => briefRegExp.test(line))
  let params = lines.filter((line) => paramRegExp.test(line))
  const macro: string = file.split(path.sep).pop()!.replace(sasRegExp, '') // macro name

  // if brief present, remove @brief keyword
  if (brief.length) brief = [brief[0].replace(briefRegExp, '')]

  // if params present, add a line break before list of params and a prefix to each param
  if (params.length) {
    brief.push('\r')

    params = params.map((param) => param.replace(paramRegExp, '-'))
  }

  // construct snippet description removing empty lines
  const description = [
    ...brief,
    params.length ? `Params:` : '',
    ...params
  ].filter((line) => line)

  return {
    prefix: `%${macro}`,
    body: `%${macro}($1)`,
    description: description
  }
}
