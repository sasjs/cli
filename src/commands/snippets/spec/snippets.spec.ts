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
import { setConstants, getMacroFolders } from '../../../utils'

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

    process.sasjsConstants.buildSourceFolder = __dirname
  })

  afterAll(async () => {
    await deleteFolder(path.join(__dirname, customOutputFolder))
    await deleteFile(path.join(__dirname, customOutputFilePath))
    await deleteFolder(buildDestinationResultsFolder)
  })

  it('should generate snippets', async () => {
    const target = new Target({
      name: 'test',
      appLoc: '/Public/test/',
      serverType: ServerType.SasViya,
      macroFolders: [testMacroFolder1]
    })
    const config: Configuration = {
      macroFolders: [testMacroFolder2],
      targets: [target]
    }

    process.sasjsConfig = config

    const macroFolders = await getMacroFolders(target)

    await generateSnippets(macroFolders, customOutputFilePath)

    const outputFilePath = path.join(__dirname, customOutputFilePath)

    await expect(fileExists(outputFilePath)).resolves.toEqual(true)

    const expectedSnippets = {
      macro2: {
        prefix: '%macro2',
        body: '%macro2($1)',
        description: [
          'Macro 2',
          '\r',
          'Params:',
          '-msg The message to be printed',
          '-indlm= ( ) Delimeter of the input string',
          '-outdlm= ( ) Delimiter of the output string'
        ]
      },
      badMacro: {
        prefix: '%badMacro',
        body: '%badMacro($1)',
        description: []
      },
      example: {
        prefix: '%example',
        body: '%example($1)',
        description: [
          'An example macro',
          '\r',
          'Params:',
          '-msg The message to be printed'
        ]
      },
      subMacro: {
        prefix: '%subMacro',
        body: '%subMacro($1)',
        description: [
          'A sub macro',
          '\r',
          'Params:',
          '-msg The message to be printed'
        ]
      },
      subSubMacro: {
        prefix: '%subSubMacro',
        body: '%subSubMacro($1)',
        description: [
          'A sub sub macro',
          '\r',
          'Params:',
          '-msg The message to be printed'
        ]
      }
    }

    const generatedSnippets = JSON.parse(await readFile(outputFilePath))

    expect(generatedSnippets).toEqual(expectedSnippets)
  })

  it('should generate snippets with default file name', async () => {
    const targetWithoutMacroFolders = new Target({
      name: 'test',
      appLoc: '/Public/test/',
      serverType: ServerType.SasViya
    })
    const config: Configuration = {
      macroFolders: [testMacroFolder2],
      targets: [targetWithoutMacroFolders]
    }

    process.sasjsConfig = config

    const macroFolders = await getMacroFolders(targetWithoutMacroFolders)

    await generateSnippets(macroFolders)

    await expect(fileExists(defaultOutputFilePath)).resolves.toEqual(true)
  })

  it('should generate snippets with custom folder and default file name', async () => {
    const config: Configuration = { macroFolders: [testMacroFolder2] }

    process.sasjsConfig = config

    const macroFolders = await getMacroFolders()

    await generateSnippets(macroFolders, customOutputFolder)

    await expect(
      fileExists(customOutputFolderWithDefaultFileName)
    ).resolves.toEqual(true)
  })

  it('should return an error if macroFolders array was not provided', async () => {
    const config: Configuration = {}

    process.sasjsConfig = config

    const macroFolders = await getMacroFolders()

    await expect(generateSnippets(macroFolders)).rejects.toEqual(
      '"macroFolders" array was not found in sasjs/sasjsconfig.json.'
    )
  })

  it('should return an error if macros were not found', async () => {
    const config: Configuration = { macroFolders: [emptyMacroFolder] }

    process.sasjsConfig = config

    const macroFolders = await getMacroFolders()

    await expect(generateSnippets(macroFolders)).rejects.toEqual(
      'No VS Code snippets has been found.'
    )
  })
})
