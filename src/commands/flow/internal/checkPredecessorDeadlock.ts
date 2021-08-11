import { FlowWave } from '../../../types'

interface PredecessorDeadlockChain {
  chain?: string[]
  present: boolean
}

export const checkPredecessorDeadlock = (flows: {
  [key: string]: FlowWave
}): PredecessorDeadlockChain => {
  for (const flowName in flows) {
    const result = checkPredecessorDeadlockRecursive(flows, flowName, [])
    if (result.present) return result
  }

  return { present: false }
}

const checkPredecessorDeadlockRecursive = (
  flows: { [key: string]: FlowWave },
  flowName: string,
  chain: string[]
): PredecessorDeadlockChain => {
  if (chain.includes(flowName))
    return { chain: [...chain, flowName], present: true }

  const predecessors = flows[flowName]?.predecessors
  if (predecessors)
    for (const predecessorName of predecessors) {
      const result = checkPredecessorDeadlockRecursive(flows, predecessorName, [
        ...chain,
        flowName
      ])
      if (result.present) return result
    }
  return { present: false }
}
