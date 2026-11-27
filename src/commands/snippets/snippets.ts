import {
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

// to check if file has .sas extension
const sasRegExp = /\.sas$/
// to get lines that have @brief keyword (case insensitive)
const briefRegExp = /^\s*(?:\/\*+\s*|\*\s*)?[@\\]brief\s/i
// to get lines that have a param keyword and optionally [direction]
const paramRegExp = /^\s*(?:\/\*+\s*|\*\s*)?[@\\]param\s?(\[.*?]\s?)?/i

/**
 * Generates VS Code snippets from the Doxygen headers in the SAS Macros.
 * @param macroFolders an array of file paths of SAS Macros.
 * @param outDirectory a folder path where generated snippets should be put into. If ends with '<file name>.json' then provided file name will be used, otherwise default file name ('sasjs-macro-snippets.json') will be used.
 * @returns a promise that resolves into a file path with generated VS Code snippets.
 */
export async function generateSnippets(
  macroFolders: string[],
  outDirectory?: string
) {
  // an object that represents generated snippets
  const snippets: { [key: string]: Snippet } = {}

  // return an error if no macro folders has been provided
  if (!macroFolders.length) {
    return Promise.reject(
      `"macroFolders" array was not found in sasjs/sasjsconfig.json.`
    )
  }

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
      snippets[macro] = await createSnippetFromMacro(file)
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

const maskNonDeclarations = (fileContent: string): string => {
  // DATALINES4 terminates only with four semicolons in columns 1-4; an
  // indented semicolon is a valid terminator for ordinary DATALINES. Mask
  // only through the terminator so code on the same line remains searchable.
  return fileContent.replace(
    /(?<![^;])(?:\s|\/\*[\s\S]*?\*\/|%\*[^;]*;)*(?:(?:datalines4|cards4|lines4)\s*;[^\r\n]*(?:\r?\n|(?![\s\S]))[\s\S]*?(?:^;;;;|(?![\s\S]))|(?:datalines|cards|lines)\s*;[^\r\n]*(?:\r?\n|(?![\s\S]))[\s\S]*?(?:^[ \t]*;|(?![\s\S])))|%['"]|\/\*[\s\S]*?(?:\*\/|(?![\s\S]))|%\*(?:%[;'"]|'(?:''|[^'])*(?:'|(?![\s\S]))|"(?:""|[^"])*(?:"|(?![\s\S]))|[^;'"%]|%(?![;'"]))*?(?:;|(?![\s\S]))|'(?:''|[^'])*(?:'|(?![\s\S]))|"(?:""|[^"])*(?:"|(?![\s\S]))/gim,
    // Preserve percent-escaped quotes so they do not start a quoted string.
    (match) =>
      match[0] === '%' && match.length === 2 ? match : ' '.repeat(match.length)
  )
}

/**
 * Creates a VS Code snippet from SAS macro.
 * @param file file path of SAS macro.
 * @returns promise that resolves with VS Code snippet.
 */
const createSnippetFromMacro = async (file: string): Promise<Snippet> => {
  const fileContent = await readFile(file)
  const lineEnding = getLineEnding(fileContent) // LF or CRLF
  const lines = fileContent.split(lineEnding)

  let brief = lines.filter((line) => briefRegExp.test(line))
  let params = lines.filter((line) => paramRegExp.test(line))
  const macro: string = file.split(path.sep).pop()!.replace(sasRegExp, '') // macro name

  // if brief present, remove @brief keyword
  if (brief.length) {
    const start = lines.findIndex((line) => briefRegExp.test(line))
    const fragments: string[] = []
    for (const [offset, line] of lines.slice(start).entries()) {
      const end = line.indexOf('*/')
      const content = end < 0 ? line : line.slice(0, end).replace(/\*+$/, '')
      const text = (offset ? content : content.replace(briefRegExp, ''))
        .trim()
        .replace(/^\*\s?/, '')
      if (
        offset &&
        (!text || /^[@\\/<%]/.test(text) || /^examples?\s*:/i.test(text))
      )
        break
      if (text) fragments.push(text)
      if (end >= 0) break
    }
    brief = [fragments.join(' ')]
  }

  // if params present, add a line break before list of params and a prefix to each param
  if (params.length) {
    brief.push('\r')

    params = params.map((param) => {
      const end = param.indexOf('*/')
      const content = end < 0 ? param : param.slice(0, end).replace(/\*+$/, '')
      return content.replace(paramRegExp, '-').trimEnd()
    })
  }

  // construct snippet description removing empty lines
  const description = [
    ...brief,
    params.length ? `Params:` : '',
    ...params
  ].filter((line) => line)

  let searchable = maskNonDeclarations(fileContent)
  // Macro-quoting functions make their arguments text, not declarations.
  const quoting = /%(?:nrstr|str|nrbquote|bquote|nrquote|quote)\s*\(/gi
  let quoted: RegExpExecArray | null
  const uncertainQuotes: { start: number; content: string }[] = []
  while ((quoted = quoting.exec(searchable))) {
    let depth = 1
    let end = quoting.lastIndex
    for (; end < searchable.length && depth; end++) {
      if (searchable[end] === '%' && /[()]/.test(searchable[end + 1] || '')) {
        end++
      } else if (searchable[end] === '(') depth++
      else if (searchable[end] === ')') depth--
    }
    // Only NRSTR masks macro triggers at compilation. Runtime quoting and
    // STR may resolve triggers, so retain them to force conservative fallback.
    const content = searchable.slice(quoted.index, end)
    const uncertain =
      !/^%nrstr\b/i.test(quoted[0]) && /%macro\s+[a-z_]\w*/i.test(content)
    if (uncertain) uncertainQuotes.push({ start: quoted.index, content })
    searchable =
      searchable.slice(0, quoted.index) +
      ' '.repeat(end - quoted.index) +
      searchable.slice(end)
    quoting.lastIndex = end
  }
  // Only one top-level matching declaration is safe to interpret. A nested
  // definition may be conditional on its enclosing macro being invoked.
  const macroTokens = /%macro\s+([a-z_]\w*)|%mend\b/gi
  let token: RegExpExecArray | null
  let depth = 0
  let matching = 0
  let nestedMatch = false
  while ((token = macroTokens.exec(searchable))) {
    if (!token[1]) {
      depth = Math.max(0, depth - 1)
    } else {
      if (token[1].toLowerCase() === macro.toLowerCase()) {
        matching++
        if (depth) nestedMatch = true
      }
      depth++
    }
  }
  const uncertainMatch = uncertainQuotes.some((quote) =>
    Array.from(quote.content.matchAll(/%macro\s+([a-z_]\w*)/gi)).some(
      (match) => match[1].toLowerCase() === macro.toLowerCase()
    )
  )
  const declarations = /%macro\s+([a-z_]\w*)\s*/gi
  let declaration: RegExpExecArray | null
  let body = `%${macro}($1)`
  while (
    matching === 1 &&
    !nestedMatch &&
    !uncertainMatch &&
    (declaration = declarations.exec(searchable))
  ) {
    if (declaration[1].toLowerCase() !== macro.toLowerCase()) continue
    if (searchable[declarations.lastIndex] !== '(') {
      if (/^(?:;|\/[^;]*;)/.test(searchable.slice(declarations.lastIndex))) {
        body = `%${macro}($0)`
        break
      }
      continue
    }
    let parenDepth = 1
    let part = ''
    const parts: string[] = []
    let index = declarations.lastIndex + 1
    for (; index < searchable.length && parenDepth; index++) {
      const char = searchable[index]
      if (char === '%' && /[(),;]/.test(searchable[index + 1] || '')) {
        part += char + searchable[++index]
      } else if (char === '(') {
        parenDepth++
        part += char
      } else if (char === ')') {
        parenDepth--
        if (parenDepth) part += char
      } else if (char === ',' && parenDepth === 1) {
        parts.push(part)
        part = ''
      } else {
        part += char
      }
    }
    if (parenDepth || !/^\s*(?:;|\/[^;]*;)/.test(searchable.slice(index)))
      continue
    parts.push(part)
    if (parts.length > 1 && parts.some((item) => !item.trim())) continue
    if (
      parts.some(
        (item) => item.includes('=') && !/^\s*[a-z_]\w*\s*=/i.test(item)
      )
    )
      continue
    let seenKeyword = false
    let invalidOrder = false
    for (const item of parts) {
      if (item.includes('=')) seenKeyword = true
      else if (item.trim() && seenKeyword) invalidOrder = true
    }
    if (invalidOrder) continue
    const positional = parts
      .map((item) => item.trim())
      .filter((item) => item && !item.includes('='))
    if (positional.some((name) => !/^[a-z_]\w*$/i.test(name))) continue
    const names = parts
      .filter((item) => item.trim())
      .map((item) => item.trim().split('=')[0].trim().toLowerCase())
    if (new Set(names).size !== names.length) continue
    body = `%${macro}(${positional.map((name, i) => `\${${i + 1}:${name}}`).join(', ') || '$0'})`
    break
  }

  return {
    prefix: `%${macro}`,
    body,
    description: description
  }
}
