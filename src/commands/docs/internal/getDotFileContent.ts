import path from 'path'
import { getFilesInFolder, getBrief, readFile } from '../../../utils/file'
import { asyncForEach } from '../../../utils/utils'

import { getFileInputs } from './getFileInputs'
import { getFileOutputs } from './getFileOutputs'
import { populateNodeDictionary } from './populateNodeDictionary'
import { populateParamNodeTypes } from './populateParamNodeTypes'

export async function getDotFileContent(
  folderList: string[],
  serverUrl: string
): Promise<string> {
  let nodeDictionary = new Map()
  let fileNodes = new Map()
  let paramNodes = new Map()
  let paramNodeTyes = new Map()

  // Populating both Maps
  await asyncForEach(folderList, async (folder) => {
    const filesNamesInPath = (
      await getFilesInFolder(folder)
    ).filter((f: string) => f.endsWith('.sas'))

    await asyncForEach(filesNamesInPath, async (fileName) => {
      const filePath = path.join(folder, fileName)
      const fileContent = await readFile(filePath)
      const fileBrief = getBrief(fileContent)
      if (fileBrief === undefined) return

      fileName = fileName.toUpperCase()

      const fileInputs = getFileInputs(fileName, fileContent, paramNodes)
      const fileOutputs = getFileOutputs(fileContent, paramNodes)

      populateNodeDictionary(nodeDictionary, paramNodes)
      populateParamNodeTypes(paramNodeTyes, paramNodes)

      if (fileInputs.length === 0 && fileOutputs.length === 0) return

      fileNodes.set(fileName, {
        edges: fileOutputs,
        label: `${fileName} | ${fileBrief}`
      })

      if (!nodeDictionary.has(fileName))
        nodeDictionary.set(fileName, `n${nodeDictionary.size}`)
    })
  })

  let dotNodes = '',
    dotVertices = ''

  // Generating Nodes for Dot fileContent
  paramNodes.forEach((node, key) => {
    let color = '#A3D0D4'
    const librefFound = key.match(/^[A-Z]{2,5}\./)
    if (librefFound) color = paramNodeTyes.get(librefFound[0])

    const attrURL = serverUrl ? `URL="${serverUrl + key}"` : ''

    dotNodes += `${nodeDictionary.get(key)} [label="${
      node.label
    }" ${attrURL} shape="cylinder" style="filled" color="${color}"]\n`

    if (node.edges.length)
      dotVertices += `${nodeDictionary.get(
        key
      )} -> {${node.edges
        .map((e: string) => nodeDictionary.get(e))
        .join(' ')}}\n`
  })

  fileNodes.forEach((node, key) => {
    const url =
      key.toLowerCase().replace(/_/g, '__').replace('.sas', '_8sas') +
      '_source.html'

    dotNodes += `${nodeDictionary.get(key)} [ shape="record" label="{${
      node.label
    }}" href="${url}" ]\n`

    if (node.edges.length)
      dotVertices += `${nodeDictionary.get(
        key
      )} -> {${node.edges
        .map((e: string) => nodeDictionary.get(e))
        .join(' ')}}\n`
  })

  return `digraph lliprc{\n${dotNodes}\n${dotVertices}\n}`
}
