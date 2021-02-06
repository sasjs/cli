import path from 'path'
import {
  getFilesInFolder,
  getList,
  getBrief,
  readFile
} from '../../../utils/file'
import { asyncForEach } from '../../../utils/utils'

export async function getDotFileContent(folderList: string[]): Promise<string> {
  let nodeDictionary = new Map()
  let fileNodes = new Map()
  let paramNodes = new Map()

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

      const fileInputs = getList('<h4> Data Inputs </h4>', fileContent)
        .map((input) => input.toUpperCase())
        .filter((input) => !input.endsWith('.DLL'))
      fileInputs.forEach((inputParam) => {
        inputParam = inputParam.toUpperCase()
        if (paramNodes.has(inputParam)) {
          const paramNode = paramNodes.get(inputParam)
          paramNode.edges.push(fileName)
          paramNodes.set(inputParam, paramNode)
        } else
          paramNodes.set(inputParam, {
            edges: [fileName],
            label: inputParam
          })
        if (!nodeDictionary.has(inputParam))
          nodeDictionary.set(inputParam, `n${nodeDictionary.size}`)
      })

      const fileOutputs = getList('<h4> Data Outputs </h4>', fileContent)
        .map((output) => output.toUpperCase())
        .filter((output) => !output.endsWith('.DLL'))
      fileOutputs.forEach((outputParam) => {
        if (!paramNodes.has(outputParam))
          paramNodes.set(outputParam, {
            edges: [],
            label: outputParam
          })
        if (!nodeDictionary.has(outputParam))
          nodeDictionary.set(outputParam, `n${nodeDictionary.size}`)
      })

      fileNodes.set(fileName, {
        edges: fileOutputs,
        label: `${fileName}|${fileBrief}`
      })

      if (!nodeDictionary.has(fileName))
        nodeDictionary.set(fileName, `n${nodeDictionary.size}`)
    })
  })

  let dotNodes = '',
    dotVertices = ''

  // Generating Nodes for Dot fileContent
  paramNodes.forEach((node, key) => {
    dotNodes += `${nodeDictionary.get(key)} [label="${
      node.label
    }" URL="${'url'}" shape="cylinder" style="filled" color="#A3D0D4"]\n`
    if (node.edges.length)
      dotVertices += `${nodeDictionary.get(
        key
      )} -> {${node.edges
        .map((e: string) => nodeDictionary.get(e))
        .join(' ')}}\n`
  })

  fileNodes.forEach((node, key) => {
    dotNodes += `${nodeDictionary.get(key)} [ shape="record" label="{${
      node.label
    }}" href="${'url'}" ]\n`
    if (node.edges.length)
      dotVertices += `${nodeDictionary.get(
        key
      )} -> {${node.edges
        .map((e: string) => nodeDictionary.get(e))
        .join(' ')}}\n`
  })

  return `digraph lliprc{\n${dotNodes}\n${dotVertices}\n}`
}
