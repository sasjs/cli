import path from 'path'
import { graphviz } from 'node-graphviz'

import { createFolder, createFile } from '@sasjs/utils'

import { getDotFileContent } from './getDotFileContent'

/**
 * Creates Dot files dot-code(data_lineage.dot) and diagram(data_lineage.svg)
 * @param {string[]} folderList- dot files will be generated against provided folderList
 * @param {string} outDirectory- the name of the output folder for dot files.
 * @param {string} serverUrl- prefixes with links to Libs(Inputs/Outputs)
 */
export async function createDotFiles(
  folderList: string[],
  outDirectory: string,
  serverUrl: string
) {
  const dotFilePath = path.join(outDirectory, 'data_lineage.dot')
  const dotGraphPath = path.join(outDirectory, 'data_lineage.svg')

  await createFolder(outDirectory)

  const dotFileContent = await getDotFileContent(folderList, serverUrl)

  await createFile(dotFilePath, dotFileContent)
  process.logger?.success(`File ${dotFilePath} has been created.`)

  try {
    const svg = await graphviz.dot(dotFileContent, 'svg')
    await createFile(dotGraphPath, svg)
    process.logger?.success(`File ${dotGraphPath} has been created.`)
  } catch (e) {
    throw 'Unable to generate graph from generated Dot file.\n' + e
  }
}
