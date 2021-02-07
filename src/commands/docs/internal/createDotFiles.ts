import path from 'path'

import { createFolder, createFile } from '../../../utils/file'

import { getDotFileContent } from './getDotFileContent'

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

  const { graphviz } = require('node-graphviz')
  const svg = await graphviz.dot(dotFileContent, 'svg')

  await createFile(dotGraphPath, svg)
}
