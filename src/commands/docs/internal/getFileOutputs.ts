import { getList } from '../../../utils/file'

export function getFileOutputs(
  fileContent: string,
  paramNodes: Map<string, { edges: string[]; label: string }>
) {
  const fileOutputs = getList('<h4> Data Outputs </h4>', fileContent)
    .map((output) => output.toUpperCase())
    .filter((output) => !output.endsWith('.DLL'))

  fileOutputs.forEach((outputParam) => {
    if (!paramNodes.has(outputParam))
      paramNodes.set(outputParam, {
        edges: [],
        label: outputParam
      })
  })
  return fileOutputs
}
