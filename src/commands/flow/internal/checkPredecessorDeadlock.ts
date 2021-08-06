export const checkPredecessorDeadlock = (flows: any): string[] | false => {
  for (const flowName in flows) {
    const result = checkPredecessorDeadlockRecursive(flows, flowName, [])
    if (result) return result
  }

  return false
}

const checkPredecessorDeadlockRecursive = (
  flows: any,
  flowName: string,
  chain: string[]
): string[] | false => {
  if (chain.includes(flowName)) return [...chain, flowName]

  if (flows[flowName]?.predecessors)
    for (const predecessorName of flows[flowName].predecessors) {
      const result = checkPredecessorDeadlockRecursive(flows, predecessorName, [
        ...chain,
        flowName
      ])
      if (result) return result
    }
  return false
}
