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

/**
 * Populates Types of Nodes Map for param (Inputs/Outputs)
 * @param {Map} paramNodeTypes- Map for param Nodes having colors
 * @param {Map} nodes- Map for params(Inputs/Outputs) Or files
 */
export function populateParamNodeTypes(
  paramNodeTypes: Map<string, string>,
  nodes: Map<string, string>
) {
  nodes.forEach((node, key) => {
    const librefFound = key.match(/^[A-Z]{2,5}\./)
    if (librefFound && !paramNodeTypes.has(librefFound[0]))
      paramNodeTypes.set(librefFound[0], CRAYONS[paramNodeTypes.size])
  })
}
