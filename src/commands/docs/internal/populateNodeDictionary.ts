/**
 * Populates Dictionary Map of All Nodes
 * @param {Map} nodeDictionary- Map for all Nodes having Alpha-Numeric name(, acceptable for dot)
 * @param {Map} nodes- Map for params(Inputs/Outputs) Or files
 */
export async function populateNodeDictionary(
  nodeDictionary: Map<string, string>,
  nodes: Map<string, { edges: string[]; label: string }>
) {
  nodes.forEach((node, key) => {
    if (!nodeDictionary.has(key))
      nodeDictionary.set(key, `n${nodeDictionary.size}`)
  })
}
