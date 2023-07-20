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

const sasRegExp = /\.sas$/
const briefRegExp = /^\s\s@brief\s/
const paramRegExp = /^\s\s@param\s/

export async function generateSnippets(
  target?: Target,
  config?: Configuration,
  outDirectory?: string
) {
  let macroFolders: string[] = []

  const configMacroFolders = config?.macroFolders

  if (configMacroFolders) {
    macroFolders = configMacroFolders
  }

  const targetMacroFolder = target?.macroFolders

  if (targetMacroFolder) {
    macroFolders = [...macroFolders, ...targetMacroFolder]
  }

  const snippets: { [key: string]: Snippet } = {}

  if (!macroFolders.length) {
    return Promise.reject(
      `"macroFolders" array was not found in sasjs/sasjsconfig.json.`
    )
  }

  macroFolders = macroFolders.map((folder) =>
    path.join(process.projectDir, folder)
  )

  await asyncForEach(macroFolders, async (folder) => {
    const sasFiles = (await listSasFilesInFolder(folder, true))
      .map((file) => path.join(folder, file))
      .filter((file) => !isTestFile(file))

    await asyncForEach(sasFiles, async (file) => {
      const macro: string = file.split(path.sep).pop().replace(sasRegExp, '')

      snippets[macro] = await createMacro(file)
    })
  })

  if (!Object.keys(snippets).length) {
    return Promise.reject('No VS Code snippets has been found.')
  }

  const defaultOutputFileName = 'sasjs-macro-snippets.json'

  const { buildDestinationResultsFolder } = process.sasjsConstants

  const snippetsFilePath = path.join(
    outDirectory ? process.projectDir : buildDestinationResultsFolder,
    outDirectory
      ? /\.json$/.test(outDirectory)
        ? outDirectory
        : path.join(outDirectory, defaultOutputFileName)
      : defaultOutputFileName
  )

  await createFile(snippetsFilePath, JSON.stringify(snippets, null, 2))

  return Promise.resolve(snippetsFilePath)
}

const createMacro = async (file: string): Promise<Snippet> => {
  const fileContent = await readFile(file)
  const lineEnding = getLineEnding(fileContent) // LF or CRLF
  const lines = fileContent.split(lineEnding)

  let brief = lines.filter((line) => briefRegExp.test(line))
  let params = lines.filter((line) => paramRegExp.test(line))
  const macro: string = file.split(path.sep).pop()!.replace(sasRegExp, '')

  if (brief.length) {
    brief = [brief[0].replace(briefRegExp, '')]
  }

  if (params.length) {
    brief.push('\r')

    params = params.map((param) => param.replace(paramRegExp, '-'))
  }

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
