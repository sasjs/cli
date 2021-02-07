import { getList } from '../../../utils/file'

export function getFileInputs(
  fileName: string,
  fileContent: string,
  paramNodes: Map<string, { edges: string[]; label: string }>
) {
  const fileInputs = getList('<h4> Data Inputs </h4>', fileContent)
    .map((input) => input.toUpperCase())
    .filter((input) => !input.endsWith('.DLL'))

  fileInputs.forEach((inputParam) => {
    inputParam = inputParam.toUpperCase()
    const paramNode = paramNodes.get(inputParam)
    if (paramNode) {
      paramNode.edges.push(fileName)
      paramNodes.set(inputParam, paramNode)
    } else
      paramNodes.set(inputParam, {
        edges: [fileName],
        label: inputParam
      })
  })

  return fileInputs
}
