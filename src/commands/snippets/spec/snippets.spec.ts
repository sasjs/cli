import { generateSnippets } from '../snippets'
import {
  ServerType,
  Target,
  Configuration,
  fileExists,
  readFile,
  deleteFile,
  deleteFolder
} from '@sasjs/utils'
import path from 'path'
import { setConstants } from '../../../utils'

describe('sasjs snippets', () => {
  const testMacroFolder1 = 'testMacros'
  const testMacroFolder2 = 'testMacros2'
  const emptyMacroFolder = 'empty'
  const customOutputFilePath = 'snippets.json'
  const defaultFileName = 'sasjs-macro-snippets.json'
  const defaultOutputFilePath = path.join(
    __dirname,
    'sasjsresults',
    defaultFileName
  )
  const customOutputFolder = 'snippets'
  const customOutputFolderWithDefaultFileName = path.join(
    __dirname,
    customOutputFolder,
    defaultFileName
  )
  const buildDestinationResultsFolder = path.join(__dirname, 'sasjsresults')

  beforeAll(async () => {
    await setConstants(false)

    process.projectDir = __dirname
    process.sasjsConstants.buildDestinationResultsFolder =
      buildDestinationResultsFolder
  })

  afterAll(async () => {
    await deleteFolder(path.join(__dirname, customOutputFolder))
    await deleteFile(path.join(__dirname, customOutputFilePath))
    await deleteFolder(buildDestinationResultsFolder)
  })

  it('should generate snippets', async () => {
    const config: Configuration = { macroFolders: [testMacroFolder2] }
    const target = new Target({
      name: 'test',
      appLoc: '/Public/test/',
      serverType: ServerType.SasViya,
      macroFolders: [testMacroFolder1]
    })

    await generateSnippets(target, config, customOutputFilePath)

    const outputFilePath = path.join(__dirname, customOutputFilePath)

    await expect(fileExists(outputFilePath)).resolves.toEqual(true)

    const expectedSnippets = await readFile(
      path.join(__dirname, 'expectedSnippets.json')
    )

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
      '"macroFolders" array was not found in sasjs/sasjsconfig.json.'
    )
  })

  it('should return an error if macros were not found', async () => {
    const config: Configuration = { macroFolders: [emptyMacroFolder] }

    await expect(generateSnippets(undefined, config)).rejects.toEqual(
      'No VS Code snippets has been found.'
    )
  })
})
