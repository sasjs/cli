import { generateSnippets } from '../snippets'
import {
  ServerType,
  Target,
  Configuration,
  fileExists,
  readFile,
  deleteFile
} from '@sasjs/utils'
import path from 'path'

describe('sasjs snippets', () => {
  const testMacroFolder1 = 'testMacros'
  const testMacroFolder2 = 'testMacros2'
  const emptyMacroFolder = 'empty'
  const customOutputFilePath = 'snippets.json'
  const defaultFileName = 'sasjs-macro-snippets.json'
  const defaultOutputFilePath = path.join(__dirname, defaultFileName)
  const customOutputFolder = 'snippets'
  const customOutputFolderWithDefaultFileName = path.join(
    __dirname,
    customOutputFolder,
    defaultFileName
  )

  afterAll(async () => {
    await deleteFile(path.join(__dirname, customOutputFilePath))
    await deleteFile(defaultOutputFilePath)
    await deleteFile(customOutputFolderWithDefaultFileName)
  })

  it('should generate snippets', async () => {
    const config: Configuration = { macroFolders: [testMacroFolder2] }
    const target = new Target({
      name: 'test',
      appLoc: '/Public/test/',
      serverType: ServerType.SasViya,
      macroFolders: [testMacroFolder1]
    })

    process.projectDir = __dirname

    await generateSnippets(target, config, customOutputFilePath)

    const outputFilePath = path.join(__dirname, customOutputFilePath)

    await expect(fileExists(outputFilePath)).resolves.toEqual(true)

    const expectedSnippets = `{
  "macro2": {
    "prefix": "%macro2",
    "body": "%macro2($1)",
    "description": [
      "Macro 2",
      "\\r",
      "Params:\\r",
      "-msg The message to be printed\\r"
    ]
  },
  "badMacro": {
    "prefix": "%badMacro",
    "body": "%badMacro($1)",
    "description": []
  },
  "example": {
    "prefix": "%example",
    "body": "%example($1)",
    "description": [
      "An example macro",
      "\\r",
      "Params:\\r",
      "-msg The message to be printed\\r"
    ]
  },
  "subMacro": {
    "prefix": "%subMacro",
    "body": "%subMacro($1)",
    "description": [
      "A sub macro",
      "\\r",
      "Params:\\r",
      "-msg The message to be printed\\r"
    ]
  },
  "subSubMacro": {
    "prefix": "%subSubMacro",
    "body": "%subSubMacro($1)",
    "description": [
      "A sub sub macro",
      "\\r",
      "Params:\\r",
      "-msg The message to be printed\\r"
    ]
  }
}`

    const generatedSnippets = await readFile(outputFilePath)

    expect(generatedSnippets).toEqual(expectedSnippets)
  })

  it('should generate snippets with default file name', async () => {
    const config: Configuration = { macroFolders: [testMacroFolder2] }

    await generateSnippets(undefined, config)

    await expect(fileExists(defaultOutputFilePath)).resolves.toEqual(true)
  })

  it('should generate snippets with custom folder and default file name', async () => {
    const config: Configuration = { macroFolders: [testMacroFolder2] }

    await generateSnippets(undefined, config, customOutputFolder)

    await expect(
      fileExists(customOutputFolderWithDefaultFileName)
    ).resolves.toEqual(true)
  })

  it('should return an error if macroFolders array was not provided', async () => {
    await expect(generateSnippets()).rejects.toEqual(
      '"macroFolders" array was not found in sasjsconfig.json.'
    )
  })

  it('should return an error if macros were not found', async () => {
    const config: Configuration = { macroFolders: [emptyMacroFolder] }

    await expect(generateSnippets(undefined, config)).rejects.toEqual(
      'No snippets has been found.'
    )
  })
})
