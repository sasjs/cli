import { getList } from '../../../utils/file'

/**
 * Returns list of Outputs and populates Map of Nodes
 * @param {string} fileContent- Contents of the file from which Outputs need to extract
 * @param {Map} paramNodes- Map for params(Inputs/Outputs)
 */
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
