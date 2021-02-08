import path from 'path'
import { graphviz } from 'node-graphviz'

import { createFolder, createFile } from '../../../utils/file'

import { getDotFileContent } from './getDotFileContent'

/**
 * Creates Dot files dot-code(generated_code.dot) and diagram(graph_diagram.svg)
 * @param {string[]} folderList- dot files will be generated against provided folderList
 * @param {string} outDirectory- the name of the output folder for dot files.
 * @param {string} serverUrl- prefixes with links to Libs(Inputs/Outputs)
 */
export async function createDotFiles(
  folderList: string[],
  outDirectory: string,
  serverUrl: string
) {
  const dotFilePath = path.join(outDirectory, 'generated_code.dot')
  const dotGraphPath = path.join(outDirectory, 'graph_diagram.svg')

  await createFolder(outDirectory)

  const dotFileContent = await getDotFileContent(folderList, serverUrl)

  await createFile(dotFilePath, dotFileContent)

  const svg = await graphviz.dot(dotFileContent, 'svg')

  await createFile(dotGraphPath, svg)
}
