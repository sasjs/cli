import { MacroVar } from '@sasjs/utils'

export interface Flow {
  name: string
  flows: {
    [key: string]: FlowWave
  }
}

export interface FlowWave {
  name?: string
  jobs: FlowWaveJob[]
  predecessors?: string[]
  execution?: 'started' | 'finished' | 'failedByPredecessor'
}

export enum FlowWaveJobStatus {
  Runnning = 'running',
  Success = 'success',
  Failure = 'failure'
}

export interface FlowWaveJob {
  location: string
  macroVars?: MacroVar
  status?: FlowWaveJobStatus
}
