import path from 'path'
import {
  getFilesInFolder,
  getList,
  getBrief,
  readFile
} from '../../../utils/file'
import { asyncForEach } from '../../../utils/utils'

const CRAYONS = [
  '#e6194b', // red
  '#3cb44b', // green
  '#4363d8', // blue
  '#f58231', // orange
  '#911eb4', // purple
  '#46f0f0', // cyan
  '#f032e6', // magenta
  '#bcf60c', // lime
  '#fabebe', // pink
  '#008080', // teal
  '#e6beff', // lavender
  '#9a6324', // brown
  '#fffac8', // beige
  '#800000', // maroon
  '#aaffc3', // mint
  '#808000', // olive
  '#ffd8b1', // apricot
  '#000075', // navy
  '#808080', // gray
  '#ffe119', // yellow
  '#ffffff' // white
]

export async function getDotFileContent(folderList: string[]): Promise<string> {
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

        const librefFound = inputParam.match(/^[A-Z]{2,5}\./)
        if (librefFound && !paramNodeTyes.has(librefFound[0]))
          paramNodeTyes.set(librefFound[0], CRAYONS[paramNodeTyes.size])
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

        const librefFound = outputParam.match(/^[A-Z]{2,5}\./)
        if (librefFound && !paramNodeTyes.has(librefFound[0]))
          paramNodeTyes.set(librefFound[0], CRAYONS[paramNodeTyes.size])
      })

      if (fileInputs.length === 0 && fileOutputs.length === 0) return

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
    let color = '#A3D0D4'
    const librefFound = key.match(/^[A-Z]{2,5}\./)
    if (librefFound) color = paramNodeTyes.get(librefFound[0])
    dotNodes += `${nodeDictionary.get(key)} [label="${
      node.label
    }" shape="cylinder" style="filled" color="${color}"]\n`
    if (node.edges.length)
      dotVertices += `${nodeDictionary.get(
        key
      )} -> {${node.edges
        .map((e: string) => nodeDictionary.get(e))
        .join(' ')}}\n`
  })

  fileNodes.forEach((node, key) => {
    const url =
      key.toLowerCase().replace(/_/g, '__').replace('.sas', '_8sas') + '.html'

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
