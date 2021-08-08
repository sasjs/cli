import { FlowWave } from '../../../types'

export const checkPredecessorDeadlock = (flows: {
  [key: string]: FlowWave
}): string[] | false => {
  for (const flowName in flows) {
    const result = checkPredecessorDeadlockRecursive(flows, flowName, [])
    if (result) return result
  }

  return false
}

const checkPredecessorDeadlockRecursive = (
  flows: { [key: string]: FlowWave },
  flowName: string,
  chain: string[]
): string[] | false => {
  if (chain.includes(flowName)) return [...chain, flowName]

  const predecessors = flows[flowName]?.predecessors
  if (predecessors)
    for (const predecessorName of predecessors) {
      const result = checkPredecessorDeadlockRecursive(flows, predecessorName, [
        ...chain,
        flowName
      ])
      if (result) return result
    }
  return false
}
