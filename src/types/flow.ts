import { MacroVar } from '@sasjs/utils'

export interface Flow {
  name: string
  flows: {
    [key: string]: FlowWave
  }
}

export interface FlowWave {
  jobs: [{ location: string; macroVars?: MacroVar }]
  predecessors?: string[]
}
