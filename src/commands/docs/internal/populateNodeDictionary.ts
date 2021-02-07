export async function populateNodeDictionary(
  nodeDictionary: Map<string, string>,
  nodes: Map<string, string>
) {
  nodes.forEach((node, key) => {
    if (!nodeDictionary.has(key))
      nodeDictionary.set(key, `n${nodeDictionary.size}`)
  })
}
